// Paper feedforward generator — POST /api/paper-feedforward
//
// Generates a feedforward .docx (agreed bordered-box style) from an exam paper the
// teacher has marked: they tag the questions pupils struggled with (selected paper
// questions and/or free-text notes), and this builds parallel practice scaffolded
// down from those questions. The .docx is stored in the paper-uploads bucket and a
// paper_feedforward_sheets row ties it to the paper (see FEEDFORWARD-FEATURE-SPEC.md).
//
// Node runtime (not edge): the docx build + a Sonnet generation can exceed the ~25s
// edge wall — same reason feynman's feedforward route runs on Node. Keeps the
// Anthropic + service-role keys server-side.
//
// Required env (Vercel): ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   NEXT_PUBLIC_SUPA_URL, NEXT_PUBLIC_SUPA_KEY.

import { buildFeedforwardDocx } from "../../../lib/feedforwardDocx";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPA_URL = process.env.NEXT_PUBLIC_SUPA_URL || "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPA_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Generation wants a stronger model than the Haiku marker; configurable.
const MODEL = process.env.ANTHROPIC_FEEDFORWARD_MODEL || "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 4096;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

// Service-role PostgREST helper (raw fetch — the app deliberately has no supabase-js dep).
async function rest(path, { method = "GET", body, params = {}, single } = {}) {
  const u = new URL(`${SUPA_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const headers = { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  if (single) headers["Accept"] = "application/vnd.pgrst.object+json";
  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
  const r = await fetch(u, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
  if (method === "DELETE") return null;
  return r.json();
}

async function rpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// Identify the caller from their Supabase JWT (validates the token).
async function getAuthedUid(req) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${m[1]}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id || null;
  } catch { return null; }
}

// Fire-and-forget AI usage logging, identical row shape to mark-paper-answer so paper
// feedforward spend shows up in the cost dashboard and counts toward the school backstop.
function logUsage(school_id, usage) {
  if (!usage) return;
  const row = {
    call_label: "paper-feedforward",
    source: "ai",
    school_id,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  };
  rest("ai_usage", { method: "POST", body: row }).catch((e) => console.error("ai_usage insert failed:", e));
}

// Hard cost backstop, same RPC as mark-paper-answer: a school >3x its fair-use
// allowance is paused. Fails OPEN on any error so a transient issue never blocks staff.
async function overBackstop(school_id) {
  if (!school_id) return false;
  try {
    const data = await rpc("school_mark_status", { p_school_id: school_id });
    const r = Array.isArray(data) ? data[0] : data;
    return !!(r && r.over_backstop);
  } catch { return false; }
}

function buildPrompt({ paper, subjectName, struggledQuestions, notes }) {
  const qList = struggledQuestions.length
    ? struggledQuestions.map((q, i) =>
        `${i + 1}. [${q.command_word || ""} ${q.marks || ""}m] ${q.question_text}${q.marking_points?.length ? `\n   Mark scheme: ${q.marking_points.map((p) => p.text).filter(Boolean).join("; ")}` : ""}`
      ).join("\n")
    : "(none selected — use the teacher's notes below to decide the topics)";
  return `You are making a one-page, printable EXAM FEEDFORWARD practice sheet for a UK secondary ${subjectName || "science"} class. A feedforward sheet rebuilds understanding and exam technique on exactly the questions a class has just struggled with on a paper/test.

PAPER: ${paper?.name || "(paper)"}${paper?.exam_board ? ` · ${paper.exam_board}` : ""}${paper?.paper_year ? ` · ${paper.paper_year}` : ""}

QUESTIONS THE CLASS STRUGGLED WITH (build the sheet around EXACTLY these, in order):
${qList}
${notes ? `\nTEACHER'S NOTES on what went wrong: ${notes}` : ""}

For EACH struggled question, produce one box that:
  1. names the topic/skill it tested,
  2. gives a short "Remember" line (2-3 sentences of the core idea in plain language),
  3. gives TWO FRESH, PARALLEL exam-style questions on the same topic/skill (do NOT copy the paper's wording) with mark tariffs and a GCSE/KS3 command word (state, describe, explain, calculate, suggest, evaluate), ramping from a 1-2 mark recall item to a higher-tariff item,
  4. gives a faint mark-scheme line listing the creditworthy points.
Use UK spelling. Pupils answer in their books, so do NOT add answer lines.

Return ONLY a JSON object (no prose, no code fences) of this exact shape:
{"title": string, "boxes": [{"heading": string, "remember": string, "questions": [{"command": string, "text": string, "marks": number}], "markScheme": string, "diagram"?: string}]}
"diagram" is OPTIONAL: include it ONLY when the question genuinely needs pupils to sketch/label something, as a short caption describing what to draw (never a real diagram).`;
}

async function generateSpec(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  const text = data?.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  let spec;
  try { spec = JSON.parse(clean); } catch { spec = null; }
  return { spec, usage: data?.usage };
}

export async function POST(req) {
  if (!SERVICE_KEY || !ANON_KEY) return json({ error: "Server not configured." }, 500);
  if (!ANTHROPIC_API_KEY) return json({ error: "AI generation is not configured." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const { paper_id, source_upload_path, struggled = {}, class_id } = body;
  if (!paper_id) return json({ error: "paper_id is required" }, 400);

  // ── AUTH: a valid staff JWT is required (this triggers a paid AI call). ──
  const uid = await getAuthedUid(req);
  if (!uid) return json({ error: "Sign in to generate a feedforward sheet." }, 401);

  // Load the paper + the caller's profile, and authorise: paper owner, a moderator,
  // or the paper-teacher's HoD (mirrors class_paper_gaps gating).
  let paper, profile;
  try {
    paper = await rest("papers", { params: { id: `eq.${paper_id}`, select: "id,name,teacher_id,subject_id,exam_board,paper_year,subjects(name,marker_profile)" }, single: true });
    profile = await rest("profiles", { params: { id: `eq.${uid}`, select: "id,role,hod_id,school_id" }, single: true });
  } catch { return json({ error: "Paper not found." }, 404); }
  if (!paper) return json({ error: "Paper not found." }, 404);

  const isModerator = profile?.role === "moderator";
  const isOwner = paper.teacher_id === uid;
  let isHodOfOwner = false;
  if (!isOwner && !isModerator) {
    try {
      const owner = await rest("profiles", { params: { id: `eq.${paper.teacher_id}`, select: "hod_id" }, single: true });
      isHodOfOwner = owner?.hod_id === uid;
    } catch { /* not authorised */ }
  }
  if (!isOwner && !isModerator && !isHodOfOwner) return json({ error: "Not your paper." }, 403);
  if (!["teacher", "moderator", "hod"].includes(profile?.role)) return json({ error: "Staff access only." }, 403);

  // Cost backstop (attribute to the class's school if given, else the teacher's).
  let schoolId = profile?.school_id || null;
  if (class_id) {
    try {
      const cls = await rest("classes", { params: { id: `eq.${class_id}`, select: "school_id" }, single: true });
      if (cls?.school_id) schoolId = cls.school_id;
    } catch { /* fall back to teacher's school */ }
  }
  if (await overBackstop(schoolId)) {
    return json({ error: "AI generation is paused for your school right now — please check your usage." }, 429);
  }

  // Load the selected struggled questions (authoritative text + mark schemes).
  let struggledQuestions = [];
  const ids = Array.isArray(struggled.question_ids) ? struggled.question_ids.filter(Boolean) : [];
  if (ids.length) {
    try {
      struggledQuestions = await rest("paper_questions", {
        params: { id: `in.(${ids.join(",")})`, paper_id: `eq.${paper_id}`, select: "id,question_label,question_text,command_word,marks,marking_points", order: "sort_order.asc" },
      });
    } catch { struggledQuestions = []; }
  }
  const notes = String(struggled.notes || struggled.freeText || "").trim();
  if (!struggledQuestions.length && !notes) {
    return json({ error: "Tell me which questions the class struggled with (tick some questions or add a note)." }, 400);
  }

  // Generate the structured spec, then build the .docx deterministically.
  const subjectName = paper?.subjects?.name || null;
  const prompt = buildPrompt({ paper, subjectName, struggledQuestions, notes });
  const { spec, usage } = await generateSpec(prompt);
  logUsage(schoolId, usage);
  if (!spec || !Array.isArray(spec.boxes) || spec.boxes.length === 0) {
    return json({ error: "Could not generate a feedforward sheet — please try again." }, 502);
  }

  let buf;
  try { buf = await buildFeedforwardDocx(spec); } catch (e) { return json({ error: "Could not build the document: " + String(e) }, 500); }

  // Upload to paper-uploads (service role), keyed by the owner so storage policies hold.
  const sheetId = crypto.randomUUID();
  const docxPath = `${paper.teacher_id}/feedforward/${sheetId}.docx`;
  try {
    const up = await fetch(`${SUPA_URL}/storage/v1/object/paper-uploads/${docxPath}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) throw new Error(`storage ${up.status}`);
  } catch (e) { return json({ error: "Could not save the document: " + String(e) }, 500); }

  // Record the sheet against the paper.
  let sheet;
  try {
    const rows = await rest("paper_feedforward_sheets", { method: "POST", body: {
      id: sheetId,
      paper_id,
      teacher_id: paper.teacher_id,
      class_id: class_id || null,
      source_upload_path: source_upload_path || null,
      struggled_input: { notes, question_ids: ids },
      spec,
      docx_path: docxPath,
      title: spec.title || `${paper.name} — feedforward`,
    } });
    sheet = Array.isArray(rows) ? rows[0] : rows;
  } catch (e) { return json({ error: "Saved the document but could not record it: " + String(e) }, 500); }

  const publicUrl = `${SUPA_URL}/storage/v1/object/public/paper-uploads/${docxPath}`;
  return json({ ok: true, sheet, url: publicUrl });
}
