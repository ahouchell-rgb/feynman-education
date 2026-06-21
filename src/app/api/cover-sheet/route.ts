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

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4096;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const todayISO = () => new Date().toISOString().slice(0, 10);

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

function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return text.trim();
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Sign in to use the AI assistant." }, 401);
  const token = auth.slice(7);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const title = String(body?.title || "").trim().slice(0, 200) || "Science lesson";
  const outline = deckOutline(slides);
  if (outline.replace(/[^a-z]/gi, "").length < 40) return j({ error: "This deck has too little content to script. Build the lesson first." }, 400);

  // Validate session (and get UID for usage accounting).
  let userId: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid or expired session — sign in again." }, 401);
    userId = (await u.json()).id;
  } catch { return j({ error: "Auth check failed." }, 401); }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: MODEL, max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `LESSON: ${title}\n\nDECK (slide by slide):\n${outline}\n\nWrite the cover lesson script.` }],
      }),
    });
  } catch (e: any) { return j({ error: `Request to Claude failed: ${e.message}` }, 502); }
  if (!res.ok) return j({ error: `Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, 502);

  const data = await res.json();
  const html = extractHtml((data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));

  // Best-effort usage logging into the shared daily pool.
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const u = data.usage || {};
      const inputTotal = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      await fetch(`${SK_URL}/rest/v1/rpc/increment_token_usage`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ p_teacher_id: userId, p_day: todayISO(), p_input: inputTotal, p_output: u.output_tokens || 0 }),
      });
    }
  } catch { /* best-effort */ }

  if (!/[<][a-z]/i.test(html)) return j({ error: "The script came back empty — try again." }, 502);
  return j({ html });
}
