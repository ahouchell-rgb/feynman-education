// Houchell Education — Deck → public revision booklet
// POST /api/deck-to-booklet
//
// Body:    { slides: Slide[], lessonTitle?: string }
// Headers: Authorization: Bearer <teacher JWT>
// Returns: { html }   (a complete, self-contained pupil-facing revision booklet)
//
// The deepest strand of "one pipeline, two surfaces": the same authored deck that
// becomes a gated class resource can also become a public interactive-science.com
// revision booklet. This generates a DRAFT booklet HTML for the teacher to review
// and download (it does NOT auto-publish to the live site) — the same
// review-before-ship philosophy as deck-to-questions. Once happy, the teacher
// commits the .html to the site and runs add_retrieval_widget.py to drop the live
// practice widget in. Auth + cost backstop mirror deck-to-questions so it can't be
// an open AI endpoint.
//
// Required env: ANTHROPIC_API_KEY. Optional: SUPABASE_SERVICE_ROLE_KEY (usage log).

import {
  AI_MODELS, ANTHROPIC_URL, ANTHROPIC_VERSION,
  bearerToken, requireUserId, json, anthropicText, extractHtml, logTokenUsage,
} from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = AI_MODELS.SONNET;
const MAX_OUTPUT_TOKENS = 8000;

const SYSTEM = `You are a UK secondary science teacher writing a pupil-facing REVISION BOOKLET (a self-study revision guide), AQA-aligned, from the content of a lesson you just taught.

OUTPUT: ONE complete, self-contained HTML5 document inside a single \`\`\`html ... \`\`\` code block. No external CSS, fonts, images, scripts or network requests — everything inline in one <style> block. Mobile-friendly and print-friendly.

HOUSE STYLE (match this look):
- Warm "paper" feel: page background #faf7f0, white content cards, dark text #1c1a14, a single accent #2E7D4F (green) for headings/rules/keyword chips.
- Headings in a serif (Georgia, serif); body in system-ui/-apple-system sans. Generous line-height (~1.6). Max content width ~720px, centred.
- Structure:
  1. A header: the lesson title (h1) and a one-line "by the end you'll be able to…" promise.
  2. The body split into 2-5 SECTIONS, each: an <h2> section heading; clear explanatory prose (short paragraphs, not bullet soup); where useful a "Key terms" box (term + plain-English definition); and a "Watch out" note for the common misconception.
  3. A "Test yourself" section at the end: 6-10 short recall questions, each as a <details><summary>question</summary><div>answer</div></details> so pupils self-quiz with hide/reveal.
- Clean, calm, exam-board-accurate. British spelling. Use correct SI units and standard notation.

CONTENT RULES:
- Base everything ONLY on the science in the LESSON CONTENT provided — explain and organise it for revision; do not invent material beyond it, and don't reference "the slide/diagram".
- Write it for the pupil to learn from independently (more than a list of facts — actually explain the ideas).
- Self-contained: no "see above/slide".

Return ONLY the HTML code block.`;

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
        default: break;
      }
    }
    if (s?.notes) lines.push(`Notes: ${stripTags(s.notes)}`);
    if (lines.length) out.push(`--- Slide ${i + 1} ---\n${lines.join("\n")}`);
  });
  return out.join("\n\n").slice(0, 16000);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." }, 500);
  }

  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to use the AI assistant." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const lessonTitle = String(body?.lessonTitle || "").trim().slice(0, 200);

  const lessonText = deckToText(slides);
  if (lessonText.length < 80) {
    return json({ error: "This deck has too little text to make a booklet from. Add some content first." }, 400);
  }

  const userId = await requireUserId(token);
  if (!userId) return json({ error: "Invalid or expired session — sign in again." }, 401);

  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return json({ error: budget.error }, budget.status);

  const userText =
    `LESSON: ${lessonTitle || "(untitled)"}\n\n` +
    `LESSON CONTENT (from the teacher's slides):\n${lessonText}\n\n` +
    `Write a complete revision booklet for this lesson, in the house style.`;

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
  await logTokenUsage(userId, data.usage);

  const html = extractHtml(anthropicText(data));
  if (!/<\s*html|<!doctype/i.test(html)) {
    return json({ error: "The model didn't return a complete booklet — try again." }, 502);
  }
  return json({ html });
}
