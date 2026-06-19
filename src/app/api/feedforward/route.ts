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

// Node runtime (not edge): the edge ~25s cap was returning 504s on the longer Sonnet
// generations (especially the multimodal paper-upload path). Node + maxDuration gives the
// Claude call room to finish.
export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
// Same anon key as src/lib/sk — public, used for the apikey header alongside the user's bearer.
const SK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4096;

// Rough Sonnet pricing — kept in step with chat-with-lesson.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
const GBP_PER_USD = 0.79;
const DAILY_CAP_GBP = Number(process.env.AI_DAILY_CAP_GBP) || 0; // £/day per teacher; 0 (default) = unlimited. Set AI_DAILY_CAP_GBP in env to re-enable.

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

function buildPrompt({ lesson, unit, gaps, className, source }: any) {
  const isExam = source === "exam";
  const gapList = gaps
    .map((g: any) => `- ${g.topic_name} — ${Math.round(g.pct_correct)}% of marks (${g.marked} ${isExam ? "exam answers" : "answers"} marked)`)
    .join("\n");
  const intro = isExam
    ? `You are making a one-page, printable EXAM FEEDFORWARD practice sheet for a UK secondary science class${className ? ` (${className})` : ""}. It targets the topics where the class lost the most marks on past-paper / exam questions and rebuilds EXAM TECHNIQUE on exactly those topics.`
    : `You are making a one-page, printable FEEDFORWARD practice sheet for a UK secondary science class${className ? ` (${className})` : ""}. A feedforward sheet scaffolds DOWN from the specific objectives a class is weakest on, so pupils can close the gap through guided practice.`;
  const gapHeading = isExam
    ? "EXAM TOPICS — most marks lost first; build the sheet around exactly these:"
    : "CLASS GAPS — weakest first; build the sheet around exactly these:";
  const boxSpec = isExam
    ? `  1. A short "Remember" line: 2-3 sentences of the core idea in plain language.
  2. Two exam-style questions with their mark allocations shown, e.g. (3 marks), ramping from a 1-2 mark recall item to a higher-tariff explain/describe question. Show the command word.
  3. A faint "Mark scheme" line listing the creditworthy points, so pupils see exactly how the marks are awarded.`
    : `  1. A short "Remember" line: 2-3 sentences of the core idea in plain language.
  2. Three questions that ramp easy -> exam-style: the first heavily scaffolded (sentence starter or word bank), the last an unscaffolded exam-style question with its mark allocation shown, e.g. (3 marks).`;
  return `${intro}

${gapHeading}
${gapList}

LESSON / UNIT CONTEXT (use only to pitch the level and vocabulary):
Unit: ${unit?.title || "(unit)"} · ${unit?.discipline || ""} · ${unit?.year_group || ""}
Lesson: ${lesson?.title || "(lesson)"}
Keywords: ${(lesson?.keywords || []).join(", ") || "none"}

Produce ONE complete, self-contained HTML document that prints cleanly on A4 in black on white. For EACH ${isExam ? "exam topic" : "weak objective"} above, in order, include a clearly bordered box containing:
${boxSpec}
Start with a title${isExam ? " (make clear it is exam practice)" : ""} and a line for the class name and date. Pupils answer in their exercise books, so do NOT add answer lines, ruled writing space, or blank gaps — keep every box compact so the whole sheet stays as short as possible. Use UK spelling and GCSE/KS3 command words (state, describe, explain, calculate). Inline all CSS; use NO external resources (no CDNs, fonts, or images). Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;
}

// Prompt for the UPLOADED-PAPER mode: the model is given image(s)/PDF of a real
// paper and (optionally) a free-text note of which questions the class struggled on.
function buildPaperPrompt({ lesson, unit, className, struggledNotes }: any) {
  const notes = String(struggledNotes || "").trim();
  return `You are making a one-page, printable EXAM FEEDFORWARD practice sheet for a UK secondary science class${className ? ` (${className})` : ""}.

The image(s) / PDF above are pages of a past paper or test the class has just sat. ${notes ? `The teacher says the class struggled most on: ${notes}.` : "Identify the questions most likely to need reteaching."}

Build the sheet around EXACTLY those questions. For each, work out the topic and the skill it tests, then include a clearly bordered box with:
  1. A short "Remember" line — 2-3 sentences of the core idea the question needed, in plain language.
  2. Two FRESH exam-style questions on the same topic/skill with mark allocations shown, e.g. (3 marks), ramping from a 1-2 mark recall item to a higher-tariff explain/describe/calculate question; show the command word. Write PARALLEL questions — do NOT copy the paper's wording.
  3. A faint "Mark scheme" line listing the creditworthy points, so pupils see how the marks are awarded.

LESSON / UNIT CONTEXT (use only to pitch the level and vocabulary):
Unit: ${unit?.title || "(unit)"} · ${unit?.discipline || ""} · ${unit?.year_group || ""}
Lesson: ${lesson?.title || "(lesson)"}

Start with a title that makes clear it is exam feedback practice, and a line for the class name and date. Pupils answer in their exercise books, so do NOT add answer lines, ruled writing space, or blank gaps — keep every box compact so the whole sheet stays as short as possible. Use UK spelling and GCSE/KS3 command words. Inline all CSS; use NO external resources. Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;
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
  const { lessonId, gaps, className, source, files, struggledNotes } = body || {};
  const isPaperUpload = source === "paper_upload";
  if (!lessonId) return jsonError("lessonId is required", 400);
  if (isPaperUpload) {
    if ((!Array.isArray(files) || files.length === 0) && !String(struggledNotes || "").trim()) {
      return jsonError("Upload a paper image/PDF, or describe the questions they struggled on", 400);
    }
  } else if (!Array.isArray(gaps) || gaps.length === 0) {
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
  if (DAILY_CAP_GBP > 0 && usedGBP >= DAILY_CAP_GBP) {
    return jsonError(`Daily cap of £${DAILY_CAP_GBP.toFixed(2)} reached (used £${usedGBP.toFixed(3)}). Resets at midnight UTC.`, 429);
  }

  // Build the model input: image/PDF blocks + notes for an uploaded paper (multimodal),
  // otherwise the gaps-text prompt. Uploaded files are passed by URL (public bucket).
  const messageContent: any = isPaperUpload
    ? [
        ...((Array.isArray(files) ? files : []).slice(0, 8).map((f: any) =>
          f?.kind === "pdf"
            ? { type: "document", source: { type: "url", url: String(f.url) } }
            : { type: "image", source: { type: "url", url: String(f.url) } }
        )),
        { type: "text", text: buildPaperPrompt({ lesson, unit, className, struggledNotes }) },
      ]
    : buildPrompt({ lesson, unit, gaps, className, source });

  // Generate (non-streaming — the teacher gets one finished sheet).
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "user", content: messageContent }] }),
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

  // Persist the sheet (best-effort) so it's reusable, not just open-to-print.
  try {
    await sb("feedforward_sheets", {
      method: "POST", token,
      body: {
        lesson_id: lessonId, unit_id: lesson.unit_id,
        class_label: isPaperUpload ? (className ? `Exam paper · ${className}` : "Exam paper feedforward")
          : source === "exam" ? (className ? `Exam · ${className}` : "Exam feedforward") : (className || null),
        gaps: isPaperUpload ? [{ struggled: String(struggledNotes || "uploaded paper") }] : gaps,
        html,
      },
    });
  } catch { /* non-fatal — the teacher still receives the sheet on-screen */ }

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
