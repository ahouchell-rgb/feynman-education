// Feynman Education — Deck → retrieval questions
// POST /api/deck-to-questions
//
// Body:    { slides: Slide[], lessonTitle?: string, count?: number, existing?: string[] }
// Headers: Authorization: Bearer <teacher JWT>
// Returns: { questions: [{ question_text, model_answer, marks }] }
//
// Turns an authored slide deck into DRAFT retrieval-practice questions, grounded
// in the science content the teacher actually put on the slides. It NEVER writes
// to the question bank — the client reviews the drafts and saves the chosen ones
// through the normal authenticated insert (RLS + plan-gate + shared-guard govern),
// exactly like the retrieval-app's QMgr "AI generate" flow. Mirrors the
// slides-assistant auth + cost backstop so it can't be an open AI endpoint.
//
// Required env: ANTHROPIC_API_KEY. Optional: SUPABASE_SERVICE_ROLE_KEY (usage log).

import {
  SK_URL, SK_ANON, AI_MODELS, ANTHROPIC_URL, ANTHROPIC_VERSION,
  bearerToken, requireUserId, json, anthropicText, logTokenUsage,
} from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";
import { getEntitlement, can } from "@/lib/entitlements";

export const runtime = "edge";

const MODEL = AI_MODELS.SONNET; // matches the feynman content routes (chat / feedforward)
const MAX_OUTPUT_TOKENS = 2400;

const SYSTEM = `You are a UK secondary science teacher writing retrieval-practice questions for an AQA-aligned question bank, based on the content of a lesson you just taught.

RULES:
- Base every question ONLY on the science content present in the LESSON CONTENT provided — the facts, definitions, equations and ideas actually on the slides. Do not test material that is not there, and do not invent beyond it.
- Each question is short-answer recall/application suitable for low-stakes retrieval practice, NOT multiple choice. Keep questions self-contained (no "as shown on the slide / diagram").
- model_answer is the mark scheme: concise, the key creditworthy point(s) only. For multi-mark questions list the distinct points. Use the bracket conventions teachers expect, e.g. "Combustion (burning)" or "9.8 N/kg (accept 10 N/kg)".
- marks is an integer 1-6 and must match the demand (a single recall fact = 1; "give two reasons" = 2; an explanation = 2-3).
- Use correct SI units and standard notation. British spelling.
- Vary difficulty and sub-topics across the set; cover the lesson's key terms; do not repeat the same fact.

Respond with ONLY a JSON array, no prose, no backticks:
[{"question_text":"...","model_answer":"...","marks":<int 1-6>}]`;

// Pull the teachable text out of a deck: titles, body text, table cells, equations,
// chart titles and speaker notes. Mirrors the html/rich handling in slides-assistant
// (rich text is HTML — strip tags; html templates are opaque, skip them).
const stripTags = (s: unknown) =>
  String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function deckToText(slides: any[]): string {
  const out: string[] = [];
  (Array.isArray(slides) ? slides : []).forEach((s, i) => {
    const lines: string[] = [];
    for (const e of (s?.elements || [])) {
      if (!e || typeof e !== "object") continue;
      switch (e.type) {
        case "text": { const t = stripTags(e.rich ? e.rich : e.text); if (t) lines.push(t); break; }
        case "equation": { if (e.latex) lines.push(`Equation: ${String(e.latex)}`); break; }
        case "chart": { if (e.title) lines.push(`Chart: ${stripTags(e.title)}`); break; }
        case "table": {
          const rows = Array.isArray(e.cells) ? e.cells : [];
          const tbl = rows.map((r: any[]) => (Array.isArray(r) ? r.map(stripTags).join(" | ") : "")).filter(Boolean).join("\n");
          if (tbl) lines.push(`Table:\n${tbl}`);
          break;
        }
        // rect / arrow / timer / image / video / visualiser / retrieval / html carry no teachable text.
        default: break;
      }
    }
    if (s?.notes) lines.push(`Notes: ${stripTags(s.notes)}`);
    if (lines.length) out.push(`--- Slide ${i + 1} ---\n${lines.join("\n")}`);
  });
  return out.join("\n\n").slice(0, 14000); // bound the prompt; a full lesson fits comfortably
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." }, 500);
  }

  // Require an authenticated teacher — not an open AI endpoint.
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to use the AI assistant." }, 401);

  // Entitlement gate (soft): only enforced when BILLING_ENFORCED=1, so current
  // pilots stay open until billing is switched on.
  if (process.env.BILLING_ENFORCED === "1") {
    const ent = await getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token });
    if (!can(ent, "ai_generators")) return json({ error: "Question generation is a Pro feature. Upgrade on the Billing page.", upgrade: true }, 402);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const lessonTitle = String(body?.lessonTitle || "").trim().slice(0, 200);
  const count = Math.max(1, Math.min(12, Number(body?.count) || 6));
  const existing: string[] = Array.isArray(body?.existing) ? body.existing : [];

  const lessonText = deckToText(slides);
  if (lessonText.length < 40) {
    return json({ error: "This deck has too little text to make questions from. Add some content first." }, 400);
  }

  // Validate the session and get the teacher's UID (also the usage key).
  const userId = await requireUserId(token);
  if (!userId) return json({ error: "Invalid or expired session — sign in again." }, 401);

  // Daily/org cost backstop (opt-in via AI_DAILY_CAP_GBP / AI_ORG_MONTHLY_CAP_GBP; fails OPEN).
  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return json({ error: budget.error }, budget.status);

  const avoid = existing.length
    ? `\n\nDo NOT duplicate or closely paraphrase these existing questions:\n- ${existing.slice(0, 25).map((s) => String(s).slice(0, 200)).join("\n- ")}`
    : "";
  const userText =
    `LESSON: ${lessonTitle || "(untitled)"}\n\n` +
    `LESSON CONTENT (from the teacher's slides):\n${lessonText}\n\n` +
    `Write ${count} retrieval questions covering this lesson's content.${avoid}`;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Cache the stable ruleset; the deck content + instruction trail it uncached.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
      }),
    });
  } catch (e: any) {
    return json({ error: `Request to Claude failed: ${e.message}` }, 502);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: `Claude ${res.status}: ${t.slice(0, 300)}` }, 502);
  }

  const data = await res.json();

  // Best-effort usage logging into the shared daily pool.
  await logTokenUsage(userId, data.usage);

  const text = anthropicText(data);
  const clean = text.replace(/```json|```/g, "").trim();
  let items: unknown;
  try { items = JSON.parse(clean); } catch { return json({ error: "The model returned malformed output — try again." }, 502); }

  const questions = (Array.isArray(items) ? items : [])
    .map((q: any) => ({
      question_text: String(q?.question_text || "").trim().slice(0, 1000),
      model_answer: String(q?.model_answer || "").trim().slice(0, 2000),
      marks: Math.max(1, Math.min(6, Number(q?.marks) || 1)),
    }))
    .filter((q) => q.question_text && q.model_answer)
    .slice(0, count);

  if (!questions.length) return json({ error: "No usable questions were generated — try a deck with more written content." }, 502);
  return json({ questions });
}
