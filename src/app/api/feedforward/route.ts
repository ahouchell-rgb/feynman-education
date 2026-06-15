// Feynman Education — Feedforward generator
// POST /api/feedforward
//
// Body:    { lessonId, gaps: [{ topic_name, pct_correct, marked }], className? }
// Headers: Authorization: Bearer <user JWT>
// Returns: { html, usage } — a one-page printable practice sheet scaffolded
//          down from the class's weakest objectives (the "close the loop" step:
//          retrieval gaps -> targeted reteach resource).
//
// Required env vars (set in Vercel):
//   ANTHROPIC_API_KEY            — secret, from console.anthropic.com
//   SUPABASE_SERVICE_ROLE_KEY    — optional; only used to log token usage

import { supaRest } from "@/lib/supabaseRest";

export const runtime = "edge";

const SK_URL = "https://uujbgdwnuspfnvfpdtvr.supabase.co";
// Same anon key as src/lib/sk — public, used for the apikey header alongside the user's bearer.
const SK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1amJnZHdudXNwZm52ZnBkdHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjgyODksImV4cCI6MjA5MDIwNDI4OX0.eMMhPSXTsTMEgnXloEnQpcGpQAwHHI-eHCLapRdSOV4";

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4096;

// Rough Sonnet pricing — kept in step with chat-with-lesson.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
const GBP_PER_USD = 0.79;
const DAILY_CAP_GBP = 1.0;

const todayISO = () => new Date().toISOString().slice(0, 10);
const costGBP = (i: number, o: number) =>
  (i / 1e6) * INPUT_USD_PER_MTOK * GBP_PER_USD + (o / 1e6) * OUTPUT_USD_PER_MTOK * GBP_PER_USD;

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });
}

// Pull the HTML doc out of the model's reply: prefer a ```html block, then a
// raw <html>…</html>, else fall back to the whole reply.
function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return text.trim();
}

interface SbOpts { method?: string; body?: any; token?: string; params?: Record<string, string>; single?: boolean; }
async function sb(path: string, { method = "GET", body, token, params, single }: SbOpts = {}): Promise<any> {
  return supaRest(SK_URL, path, { method, body, params, apikey: SK_ANON_KEY, bearer: token, single });
}

function buildPrompt({ lesson, unit, gaps, className }: any) {
  const gapList = gaps
    .map((g: any) => `- ${g.topic_name} — ${Math.round(g.pct_correct)}% correct (${g.marked} answers marked)`)
    .join("\n");
  return `You are making a one-page, printable FEEDFORWARD practice sheet for a UK secondary science class${className ? ` (${className})` : ""}. A feedforward sheet scaffolds DOWN from the specific objectives a class is weakest on, so pupils can close the gap through guided practice.

CLASS GAPS — weakest first; build the sheet around exactly these:
${gapList}

LESSON / UNIT CONTEXT (use only to pitch the level and vocabulary):
Unit: ${unit?.title || "(unit)"} · ${unit?.discipline || ""} · ${unit?.year_group || ""}
Lesson: ${lesson?.title || "(lesson)"}
Keywords: ${(lesson?.keywords || []).join(", ") || "none"}

Produce ONE complete, self-contained HTML document that prints cleanly on A4 in black on white. For EACH weak objective above, in order, include a clearly bordered box containing:
  1. A short "Remember" line: 2-3 sentences of the core idea in plain language.
  2. Three questions that ramp easy -> exam-style: the first heavily scaffolded (sentence starter or word bank), the last an unscaffolded exam-style question with its mark allocation shown, e.g. (3 marks).
  3. Faint ruled lines / working space for pupils to write.
Start with a title and a line for the class name and date. Use UK spelling and GCSE/KS3 command words (state, describe, explain, calculate). Inline all CSS; use NO external resources (no CDNs, fonts, or images). Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY not configured in Vercel env vars.", 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return jsonError("Missing bearer token", 401);
  const token = authHeader.slice(7);

  let body: any;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body", 400); }
  const { lessonId, gaps, className } = body || {};
  if (!lessonId || !Array.isArray(gaps) || gaps.length === 0) {
    return jsonError("lessonId and a non-empty gaps array are required", 400);
  }

  // Validate the user (and get their UID for usage accounting).
  let userId: string;
  try {
    const ur = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!ur.ok) return jsonError("Invalid auth", 401);
    userId = (await ur.json()).id;
  } catch { return jsonError("Auth check failed", 401); }

  // Load lesson + unit + today's usage under the user's RLS.
  let lesson: any, unit: any, todayUsage: any;
  try {
    [lesson, todayUsage] = await Promise.all([
      sb("lessons", { token, params: { id: `eq.${lessonId}` }, single: true }),
      sb("daily_token_usage", { token, params: { teacher_id: `eq.${userId}`, day: `eq.${todayISO()}` } }),
    ]);
    unit = await sb("units", { token, params: { id: `eq.${lesson.unit_id}` }, single: true }).catch(() => ({}));
    todayUsage = (todayUsage && todayUsage[0]) || { input_tokens: 0, output_tokens: 0 };
  } catch (e: any) {
    return jsonError(`Couldn't load lesson context: ${e.message}`, 500);
  }

  // Daily cap — same budget pool as the lesson chat.
  const usedGBP = costGBP(todayUsage.input_tokens || 0, todayUsage.output_tokens || 0);
  if (usedGBP >= DAILY_CAP_GBP) {
    return jsonError(`Daily cap of £${DAILY_CAP_GBP.toFixed(2)} reached (used £${usedGBP.toFixed(3)}). Resets at midnight UTC.`, 429);
  }

  // Generate (non-streaming — the teacher gets one finished sheet).
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "user", content: buildPrompt({ lesson, unit, gaps, className }) }] }),
    });
  } catch (e: any) {
    return jsonError(`Anthropic request failed: ${e.message}`, 502);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return jsonError(`Anthropic ${res.status}: ${t.slice(0, 300)}`, 502);
  }

  const data = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const html = extractHtml(text);
  const inputTok = data.usage?.input_tokens || 0;
  const outputTok = data.usage?.output_tokens || 0;

  // Log token usage (best-effort; never fails the response).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(`${SK_URL}/rest/v1/rpc/increment_token_usage`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ p_teacher_id: userId, p_day: todayISO(), p_input: inputTok, p_output: outputTok }),
      });
    } catch { /* non-fatal */ }
  }

  return new Response(
    JSON.stringify({ html, usage: { inputTokens: inputTok, outputTokens: outputTok, costGBP: costGBP(inputTok, outputTok) } }),
    { headers: { "content-type": "application/json" } },
  );
}
