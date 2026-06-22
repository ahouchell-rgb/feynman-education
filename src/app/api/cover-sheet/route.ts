// Feynman Education — Cover / non-specialist lesson script (strategy #8).
// POST /api/cover-sheet   Authorization: Bearer <teacher JWT>
//
// Body:    { slides: Slide[], title?: string }
// Returns: { html } — a printable, slide-by-slide teaching script so a cover
//          teacher or non-specialist can deliver the lesson: what to say, what's
//          on screen, timings, and the answers. Addresses the science
//          recruitment/cover crisis. Mirrors the feedforward route's auth + cost
//          backstop; never an open AI endpoint.
//
// Env: ANTHROPIC_API_KEY. Optional: SUPABASE_SERVICE_ROLE_KEY (usage log).

import { SK_URL, SK_ANON, bearerToken, requireUserId, extractHtml, anthropicText, logTokenUsage, callAnthropic, json as j } from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";
import { maybeFactcheck } from "@/lib/factcheck";
import { getEntitlement, can } from "@/lib/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 4096;

const stripTags = (s: unknown) =>
  String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Per-slide teachable text — titles/body/tables/equations/timers/notes — kept
// structured so the model can write a script beat-by-beat.
function deckOutline(slides: any[]): string {
  const out: string[] = [];
  (Array.isArray(slides) ? slides : []).forEach((s, i) => {
    const lines: string[] = [];
    for (const e of (s?.elements || [])) {
      if (!e || typeof e !== "object") continue;
      switch (e.type) {
        case "text": { const t = stripTags(e.rich ? e.rich : e.text); if (t) lines.push(t); break; }
        case "equation": { if (e.latex) lines.push(`Equation: ${String(e.latex)}`); break; }
        case "table": {
          const rows = Array.isArray(e.cells) ? e.cells : [];
          const tbl = rows.map((r: any[]) => (Array.isArray(r) ? r.map(stripTags).join(" | ") : "")).filter(Boolean).join("\n");
          if (tbl) lines.push(`Table:\n${tbl}`); break;
        }
        case "timer": { if (e.duration) lines.push(`Timer: ${Math.round(Number(e.duration) / 60)} min task`); break; }
        case "chart": { if (e.title) lines.push(`Chart: ${stripTags(e.title)}`); break; }
        default: break;
      }
    }
    if (s?.notes) lines.push(`Teacher notes: ${stripTags(s.notes)}`);
    out.push(`--- Slide ${i + 1} ---\n${lines.length ? lines.join("\n") : "(visual only)"}`);
  });
  return out.join("\n\n").slice(0, 16000);
}

const SYSTEM = `You write a COVER LESSON SCRIPT for a UK secondary lesson (infer the subject from the slides), so a cover teacher or non-specialist who does NOT know the subject can deliver it confidently from the slides. You are given the deck slide-by-slide.

Produce ONE self-contained HTML document that prints cleanly on A4 in black on white. Structure:
- A header: the lesson title, "Cover lesson script", a line for class + date, and a 2-3 sentence PLAIN-ENGLISH overview of what the lesson is about and the single big idea.
- A "Before you start" box: any equipment/setup implied by the slides, and — if any practical/hazard is implied — a clear "Safety" line telling a non-specialist to follow the school's risk assessment and not to run a practical they're unsure about.
- Then, FOR EACH SLIDE in order, a compact block with the slide number + a short title and:
   • "Say" — what to say to the class in plain language a non-specialist can read aloud (2-4 sentences).
   • "On screen / do" — what's shown and what the class should do, with the timing if the slide implies one.
   • "Answers" — the correct answers/mark points for any question, MCQ or task on that slide (so the non-specialist can check work). Omit if the slide has no question.
- A short "If you have time / if you finish early" line at the end.

Keep it accurate to KS3-GCSE and to the slide content — do NOT invent science beyond the slides. Encouraging, clear, jargon-free. UK spelling. Inline all CSS; NO external resources. Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);
  const token = bearerToken(req);
  if (!token) return j({ error: "Sign in to use the AI assistant." }, 401);

  // Entitlement gate (soft): only enforced when BILLING_ENFORCED=1, so current
  // pilots stay open until billing is switched on.
  if (process.env.BILLING_ENFORCED === "1") {
    const ent = await getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token });
    if (!can(ent, "ai_generators")) return j({ error: "Cover sheet generation is a Pro feature. Upgrade on the Billing page.", upgrade: true }, 402);
  }

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const title = String(body?.title || "").trim().slice(0, 200) || "Science lesson";
  const outline = deckOutline(slides);
  if (outline.replace(/[^a-z]/gi, "").length < 40) return j({ error: "This deck has too little content to script. Build the lesson first." }, 400);

  const userId = await requireUserId(token);
  if (!userId) return j({ error: "Invalid or expired session — sign in again." }, 401);

  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return j({ error: budget.error }, budget.status || 429);

  let res: Response;
  try {
    res = await callAnthropic({
      model: MODEL, max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `LESSON: ${title}\n\nDECK (slide by slide):\n${outline}\n\nWrite the cover lesson script.` }],
    }, { apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (e: any) { return j({ error: `Request to Claude failed: ${e.message}` }, 502); }
  if (!res.ok) return j({ error: `Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, 502);

  const data = await res.json();
  const html = extractHtml(anthropicText(data));
  await logTokenUsage(userId, data.usage);

  if (!/[<][a-z]/i.test(html)) return j({ error: "The script came back empty — try again." }, 502);

  // The deck outline is the curriculum context the script must stay faithful to.
  const factcheck = await maybeFactcheck({ html, ctx: `LESSON: ${title}\n\nDECK (slide by slide):\n${outline}`, apiKey: process.env.ANTHROPIC_API_KEY });
  return j(factcheck ? { html, factcheck } : { html });
}
