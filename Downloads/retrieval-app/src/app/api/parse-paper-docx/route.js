// Parse an uploaded exam .docx into a tickable question list — POST /api/parse-paper-docx
//
// Phase 2 of the feedforward feature. The teacher uploads a Word exam paper to the
// paper-uploads bucket; this downloads it, extracts the text with mammoth, and asks
// Haiku to split it into numbered questions with mark tariffs. Returns a DRAFT list
// the teacher ticks in the Feedforward panel — nothing is written to paper_questions
// (parsing is best-effort; the teacher confirms what's relevant).
//
// Node runtime: mammoth is a Node library and the Haiku call can run a few seconds.
// Required env (Vercel): ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   NEXT_PUBLIC_SUPA_URL, NEXT_PUBLIC_SUPA_KEY.

import mammoth from "mammoth";
import {
  SUPA_URL, ANON_KEY, SERVICE_KEY, ANTHROPIC_API_KEY,
  jsonResponse as json, rest, getAuthedUid, logUsage, overBackstop, anthropicMessages, responseText,
} from "../../../lib/serverSupa";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXTRACT_MODEL = process.env.ANTHROPIC_EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const MAX_TEXT_CHARS = 24000; // bound the prompt: a long paper is plenty within this

const EXTRACT_SYSTEM = `You extract exam questions from the raw text of a UK secondary past paper. Return ONLY a JSON array (no prose, no code fences) of objects:
{"label": string, "text": string, "marks": number|null, "command_word": string|null}
- label: the question number/label exactly as printed (e.g. "3", "7(a)", "11").
- text: the question wording a pupil answers, concise. OMIT mark schemes, instructions, figure captions, and page headers.
- marks: the mark tariff if shown (e.g. "[3 marks]" -> 3), else null.
- command_word: the GCSE/KS3 command word if identifiable (State, Define, Describe, Explain, Calculate, Suggest, Evaluate, Compare), else null.
Include every distinct question and sub-question a pupil answers, in order. Ignore cover pages, blank lines, "Answer all questions", and formula sheets. If you cannot find any questions, return [].`;

export async function POST(req) {
  if (!SERVICE_KEY || !ANON_KEY) return json({ error: "Server not configured." }, 500);
  if (!ANTHROPIC_API_KEY) return json({ error: "AI parsing is not configured." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const path = String(body?.source_upload_path || "");
  if (!path) return json({ error: "source_upload_path is required" }, 400);

  const uid = await getAuthedUid(req);
  if (!uid) return json({ error: "Sign in to read a paper." }, 401);
  // The upload is keyed by the uploader's uid (see PaperEditor). Only let a caller
  // parse their own upload (or a moderator) — don't read arbitrary bucket paths.
  let schoolId = null;
  try {
    const profile = await rest("profiles", { params: { id: `eq.${uid}`, select: "role,school_id" }, single: true });
    schoolId = profile?.school_id || null;
    if (profile?.role !== "moderator" && !path.startsWith(`${uid}/`)) return json({ error: "Not your file." }, 403);
  } catch { return json({ error: "Could not verify access." }, 403); }
  // Cost backstop on the parse call too (fails open).
  if (await overBackstop(schoolId)) {
    return json({ error: "AI parsing is paused for your school right now — please check your usage." }, 429);
  }

  // Only .docx is parseable here (mammoth). PDFs/images still upload + work via notes.
  if (!/\.docx?$/i.test(path)) {
    return json({ error: "Only Word (.docx) papers can be read automatically — for a PDF or photo, type the questions in the notes box." }, 415);
  }

  // Download the file with the service role (bucket is public, but use the auth path).
  let buffer;
  try {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/paper-uploads/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!r.ok) throw new Error(`storage ${r.status}`);
    buffer = Buffer.from(await r.arrayBuffer());
  } catch (e) { return json({ error: "Could not read the uploaded file: " + String(e) }, 502); }

  // Extract plain text.
  let text;
  try {
    const out = await mammoth.extractRawText({ buffer });
    text = (out?.value || "").trim();
  } catch (e) { return json({ error: "Could not read text from that document: " + String(e) }, 422); }
  if (!text) return json({ error: "That document had no readable text. Type the questions in the notes box instead." }, 422);
  if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);

  // Ask Haiku to split it into questions.
  const data = await anthropicMessages({
    model: EXTRACT_MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: EXTRACT_SYSTEM }],
    messages: [{ role: "user", content: `Raw paper text:\n\n${text}` }],
  });
  logUsage("paper-parse", schoolId, data?.usage);

  let parsed;
  try { parsed = JSON.parse(responseText(data)); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return json({ error: "Could not read questions from that paper — type them in the notes box instead." }, 502);

  // Validate/clamp into a clean draft list.
  const questions = parsed
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .slice(0, 60)
    .map((q) => ({
      label: typeof q.label === "string" ? q.label.slice(0, 12) : null,
      text: q.text.trim().slice(0, 600),
      marks: Number.isFinite(q.marks) ? Math.max(0, Math.min(30, q.marks | 0)) : null,
      command_word: typeof q.command_word === "string" ? q.command_word.slice(0, 20) : null,
    }));

  return json({ ok: true, questions });
}
