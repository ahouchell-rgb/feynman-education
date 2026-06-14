import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const sb = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Exam-paper system prompt is more specific than retrieval marking. It's keyed
// to GCSE-style command words and a marking-points list. Importantly: this marker
// is STRICT, not benevolent. Awarded marks affect a paper grade, so false positives
// are worse than false negatives. No double-check overturn here.
const SYSTEM_PROMPT = `You are an experienced UK GCSE science examiner marking a student's exam-paper response. You apply the published marking points strictly and fairly, like a real exam board would.

MARKING APPROACH:
- The question has a list of marking points. Each point is worth a specific number of marks.
- A point is awarded ONLY if the student's answer clearly demonstrates that point. Vague gestures or paraphrases that don't capture the underlying science do not earn the mark.
- Award points independently. A student can score on point 2 but not point 1.
- Maximum total marks is the sum of marks_max declared on the question. Never award more than this.
- Do not award marks for points the student did not address, even if their answer is otherwise correct or impressive.
- Spelling, grammar, and informal language are fine if the science is right.
- Equivalent notation is accepted: chemical symbols (Fe = iron), unit symbols/words (5N = 5 newtons), formulae (H2O = water).

COMMAND WORDS:
- 'State' / 'Define' — short, factual recall. Award the mark only if the answer matches the required fact.
- 'Describe' — a sequence of observable features. Award one mark per distinct feature listed in the marking points.
- 'Explain' — requires causation. The student must give a 'because' link, not just a description. Don't award explanation marks for description-only answers.
- 'Calculate' — show working OR get the right answer with correct units. Wrong units = no mark for the unit point.
- 'Evaluate' / 'Compare' — requires both sides AND a judgement. A one-sided answer caps at partial marks.
- 'Suggest' — accept any scientifically reasonable answer that addresses the prompt.

FLAGGING:
- Set flagged=true ONLY for genuine non-attempts (blank, gibberish, restating the question, 'I don't know'). Do not flag a poor answer that is a genuine attempt.

RESPONSE FORMAT:
Respond with ONLY valid JSON, no backticks, no commentary:
{
  "marks_awarded": <integer between 0 and marks_max>,
  "awarded_points": [<integer indices, 0-based, of marking points awarded>],
  "feedback": "<one or two sentences in the voice of an examiner: what they earned, what was missing, written as you would write on a script>",
  "flagged": <true|false>
}`;

// Identify the calling pupil from their Supabase JWT (older clients send only the
// anon apikey → null, and we then just mark without recording).
async function getAuthedUid(req: Request): Promise<string | null> {
  if (!sb) return null;
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await sb.auth.getUser(m[1]);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch { return null; }
}

async function markWithAI(question: string, command_word: string, marks: number, marking_points: Array<{ text?: string; marks?: number }>, student_answer: string) {
  const pointsList = marking_points
    .map((p, i) => `  ${i}. (${p.marks ?? 1} mark${(p.marks ?? 1) > 1 ? "s" : ""}) ${p.text ?? ""}`)
    .join("\n");
  const userMessage = `Question (${marks} mark${marks > 1 ? "s" : ""}, command word: ${command_word || "none"}):\n${question}\n\nMarking points:\n${pointsList}\n\nStudent's answer:\n${student_answer}\n\nMaximum marks awardable: ${marks}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: { marks_awarded?: number; awarded_points?: number[]; feedback?: string; flagged?: boolean };
  try { parsed = JSON.parse(clean); } catch { parsed = { marks_awarded: 0, awarded_points: [], feedback: "Could not parse marking response.", flagged: false }; }
  const ma = Math.max(0, Math.min(Number(parsed.marks_awarded) || 0, Number(marks) || 1));
  const ap = Array.isArray(parsed.awarded_points) ? parsed.awarded_points.filter((n) => typeof n === "number" && n >= 0 && n < marking_points.length) : [];
  return { marks_awarded: ma, awarded_points: ap, feedback: parsed.feedback || "", flagged: !!parsed.flagged };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { attempt_id, paper_question_id, student_answer } = body;
    if (!student_answer) return json({ error: "Missing fields" }, 400);

    // Resolve the question AUTHORITATIVELY from the DB when we have its id — never
    // trust client-supplied marks / marking_points (a cheat could inflate them).
    // Falls back to client fields for older clients (marking only, no recording).
    let dbQ: { paper_id?: string; question_text?: string; command_word?: string; marks?: number; marking_points?: unknown } | null = null;
    if (sb && paper_question_id) {
      const { data } = await sb.from("paper_questions")
        .select("paper_id, question_text, command_word, marks, marking_points")
        .eq("id", paper_question_id).single();
      if (data) dbQ = data;
    }
    const question = (dbQ?.question_text ?? body.question) as string;
    const command_word = (dbQ?.command_word ?? body.command_word) as string;
    const marks = Number(dbQ?.marks ?? body.marks) || 1;
    const marking_points = Array.isArray(dbQ?.marking_points) ? dbQ!.marking_points as Array<{ text?: string; marks?: number }>
      : (Array.isArray(body.marking_points) ? body.marking_points : []);
    if (!question || !Array.isArray(marking_points)) return json({ error: "Missing fields" }, 400);

    if (!ANTHROPIC_API_KEY) {
      return json({ marks_awarded: 0, awarded_points: [], feedback: "AI marking not configured.", flagged: false, source: "fallback", recorded: false, response_id: null });
    }

    const verdict = await markWithAI(question, command_word, marks, marking_points, student_answer);

    // Record server-side, but ONLY for the authenticated pupil, ONLY on their own
    // attempt, and ONLY when the question really belongs to that attempt's paper.
    let recorded = false;
    let response_id: string | null = null;
    const uid = await getAuthedUid(req);
    if (sb && uid && dbQ && attempt_id && paper_question_id) {
      const att = await sb.from("paper_attempts").select("id, paper_id, student_id").eq("id", attempt_id).single();
      if (!att.error && att.data && att.data.student_id === uid && att.data.paper_id === dbQ.paper_id) {
        const row = {
          attempt_id, paper_question_id, student_answer,
          marks_awarded: verdict.marks_awarded, marks_max: marks,
          ai_feedback: verdict.feedback, awarded_points: verdict.awarded_points, flagged: verdict.flagged,
        };
        const existing = await sb.from("paper_responses").select("id").eq("attempt_id", attempt_id).eq("paper_question_id", paper_question_id).limit(1);
        if (!existing.error && existing.data && existing.data.length > 0) {
          await sb.from("paper_responses").update(row).eq("id", existing.data[0].id);
          response_id = existing.data[0].id as string;
          recorded = true;
        } else {
          const ins = await sb.from("paper_responses").insert(row).select("id").single();
          if (!ins.error && ins.data) { response_id = ins.data.id as string; recorded = true; }
        }
        // Recompute the attempt totals from the stored responses — authoritative,
        // so neither awarded_marks nor total_marks is ever a client-supplied value.
        if (recorded) {
          const all = await sb.from("paper_responses").select("marks_awarded").eq("attempt_id", attempt_id);
          const awarded = (all.data || []).reduce((s, r) => s + (Number(r.marks_awarded) || 0), 0);
          const pq = await sb.from("paper_questions").select("marks").eq("paper_id", dbQ.paper_id);
          const total = (pq.data || []).reduce((s, r) => s + (Number(r.marks) || 0), 0);
          await sb.from("paper_attempts").update({ awarded_marks: awarded, total_marks: total }).eq("id", attempt_id);
        }
      }
    }

    return json({ ...verdict, source: "ai", recorded, response_id });
  } catch (error) {
    return json({ marks_awarded: 0, awarded_points: [], feedback: "Marking error — try again.", flagged: false, source: "error", recorded: false, response_id: null, error: String(error) }, 500);
  }
});
