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

// Cache safety thresholds
const CONFIRMATION_THRESHOLD = 3;       // entries become authoritative at this many independent confirmations
const MAX_HITS_BEFORE_REVERIFY = 50;    // after this many hits, force re-verify on the next call
const MAX_AGE_DAYS_BEFORE_REVERIFY = 90; // entries older than this re-verify next call
const MIN_ANSWER_WORDS = 3;             // never cache anything shorter than this in absolute terms
const MIN_LENGTH_RATIO = 0.6;           // OR at least 60% of model answer length

const SYSTEM_PROMPT = `You are a UK secondary science teacher marking retrieval practice homework. You are generous but not soft — students get credit when the science is right, even if the notation is shorthand.

EQUIVALENT NOTATION — always treat these as identical to the written-out form:
- Chemical symbols vs element names: "Fe" = "iron", "Na" = "sodium", "H2O" = "water", "CO2" = "carbon dioxide", "O2" = "oxygen", "NaCl" = "sodium chloride", etc. Case matters less than content ("fe", "FE", "Fe" all fine for iron).
- Unit symbols vs unit names: "2000m" = "2000 metres" = "2000 m", "5N" = "5 newtons", "10s" = "10 seconds", "300K" = "300 kelvin", "50cm3" = "50 cm³" = "50 cubic centimetres". The space between number and unit is optional. Superscripts/subscripts are optional (cm3 = cm³, H2O = H₂O).
- Formulae vs names for common molecules: accept either.
- Abbreviations students commonly use: "temp" for temperature, "conc" for concentration, "e-" or "e−" for electron, "+ve/-ve" for positive/negative.
If the student's answer contains the correct quantity AND a recognisable unit (symbol OR word), it is correct.

MODEL ANSWER CONVENTIONS — the model answer may use these bracket patterns to indicate accepted variations. You must interpret them correctly:

1. EXPLICIT ALTERNATIVES — brackets containing the word "accept" give an additional valid value. Either form is fully correct.
   Example: "9.8 N/kg (accept 10 N/kg)" — student writing either "9.8 N/kg" or "10 N/kg" is fully correct.
   Example: "Joules (accept J)" — both are fully correct.

2. EQUIVALENT FORMS — brackets containing the word "or" give an equivalent form. Either form is fully correct.
   Example: "0.75 (or 75%)" — both "0.75" and "75%" are fully correct.
   Example: "It quadruples (multiplied by 4)" — either phrasing is fully correct.

3. CLARIFICATIONS — brackets that do NOT contain "accept" or "or" are explanation of the answer, not something the student must also write.
   Example: "Mechanically (by a force)" — student writing just "mechanically" is fully correct. They do not need to add "by a force".
   Example: "Insulate the container (lid and/or lagging)" — "insulate the beaker" or "put a lid on it" is fully correct.
   Example: "Thermal (internal) store" — "thermal store" or "internal store" is fully correct.

4. PICK-FROM-LIST — when the model answer begins "Any N of:" or ends with "(any N)" or "(any one)" / "(any two)" / "(any three)", the student needs to give that many valid items from the listed options.
   - Items count even with different word forms or common synonyms (e.g. "sun" for "solar", "wind power" for "wind", "petrol" for "oil", "gas" for "natural gas", "hydro" for "hydroelectric").
   - Do NOT double-count synonyms — "solar" and "sun" are the same item, count once.
   - marks_awarded = number of unique valid items the student gave, capped at the question's marks value.
   - Set correct=true ONLY if marks_awarded equals the full marks for the question; otherwise correct=false with partial marks_awarded.
   - Worked example A (3-mark question, model answer "Any three of: solar, wind, hydroelectric, tidal, wave, geothermal, biofuel"): student writes "wind and the sun and tides" → 3 unique valid items → marks_awarded=3, correct=true.
   - Worked example B (same question, same model answer): student writes "solar power and wind" → 2 unique valid items → marks_awarded=2, correct=false.
   - Worked example C (1-mark question, model answer "Coal, oil, natural gas, nuclear (any one)"): student writes "coal" → marks_awarded=1, correct=true. Student writes "coal and gas" → still marks_awarded=1, correct=true (full marks already reached).

MARKING PRINCIPLES:
- Accept correct scientific content even with poor spelling, informal language, or incomplete sentences.
- Accept equivalent scientific explanations that differ in wording from the model answer.
- Do NOT accept vague answers that gesture at the right area without demonstrating actual knowledge (e.g. "something to do with cells", "it helps the body").
- Do NOT accept answers that are scientifically incorrect or contradict the model answer.
- For questions worth 2+ marks, the student must address multiple distinct points — partial credit only if they clearly demonstrate some knowledge.

MARK CORRECT if:
- The core scientific concept from the model answer is clearly present.
- A valid alternative scientific explanation is given.
- The answer uses equivalent notation (symbols, shorthand units, formulae) as described above.
- The answer matches one of the explicit alternatives or equivalent forms given in the model answer.
- Minor details are missing but the key idea is unambiguously demonstrated.

MARK INCORRECT if:
- The answer is scientifically wrong.
- The answer is too vague to confirm understanding.
- The answer is off-topic or unrelated.
- The answer has the right structure but a wrong value/unit (e.g. model says "2000 m" and student writes "2000 km" — that's wrong).

SET flagged: true if the answer is clearly not a genuine attempt:
- Restating or closely paraphrasing the question back as an answer.
- Generic filler with no scientific content ("I think so", "yes it does", "the thing").
- Random or incoherent words that happen to pass a spam filter.
- Anything that would insult a teacher's intelligence as an attempt.

CONFIDENCE FIELD:
- Set confidence to "high" when the science is unambiguously right or unambiguously wrong, the answer is well-formed, and a colleague would mark it the same way without hesitation.
- Set confidence to "medium" or "low" for borderline calls, partial credit cases, ambiguous wording, or any answer where another teacher could reasonably disagree with you.

Respond ONLY with valid JSON, no backticks: {"correct":true/false,"marks_awarded":<int 0 to marks>?,"feedback":"<one concise sentence>","flagged":true/false,"confidence":"high"|"medium"|"low"}`;

function extractNumbers(text: string): string[] {
  const matches = text.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g);
  return matches ? matches.map(m => m.replace(/^-/, "")) : [];
}

function checkNumericalMatch(modelAnswer: string, studentAnswer: string): boolean {
  const modelNums = extractNumbers(modelAnswer);
  if (modelNums.length !== 1) return false;
  const studentNums = extractNumbers(studentAnswer);
  return studentNums.includes(modelNums[0]);
}

// Normalise an answer for cache lookup. Conservative: lowercase, strip
// punctuation (but keep hyphens for compound terms), drop leading articles,
// collapse whitespace. Do NOT do edit-distance or stemming.
function normalise(text: string): string {
  let t = (text || "").toLowerCase().trim();
  // Strip punctuation except hyphens and apostrophes-in-words
  t = t.replace(/[.,;:!?\"“”‘’()\[\]{}\/\\]/g, " ");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  // Strip leading articles
  t = t.replace(/^(the|a|an)\s+/, "");
  return t;
}

// Check the length floor: cached answer must be at least 60% of model answer length
// OR at least 3 words long. This catches "yes" / "I don't know" / "blood pumps" cases.
function passesLengthFloor(studentAnswer: string, modelAnswer: string): boolean {
  const studentWords = studentAnswer.trim().split(/\s+/).filter(Boolean);
  const modelWords = modelAnswer.trim().split(/\s+/).filter(Boolean);
  if (studentWords.length >= MIN_ANSWER_WORDS) return true;
  // Below MIN_ANSWER_WORDS: only allow if it's at least MIN_LENGTH_RATIO of the model answer
  if (modelWords.length === 0) return false;
  return studentWords.length / modelWords.length >= MIN_LENGTH_RATIO;
}

// Fire-and-forget AI usage logging
function logUsage(label: string, usage: Record<string, unknown> | undefined) {
  if (!sb || !usage) return;
  const row = {
    call_label: label,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  };
  sb.from("ai_usage").insert(row).then(() => {}).catch((e) => console.error("ai_usage insert failed:", e));
}

async function callAiMark(label: string, question: string, model_answer: string, student_answer: string, marks: number) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        content: `Question (${marks} mark${marks > 1 ? 's' : ''}): ${question}\nModel answer: ${model_answer}\nStudent wrote: ${student_answer}`,
      }],
    }),
  });
  const data = await response.json();
  logUsage(label, data?.usage);
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// Look for an authoritative cache entry. Returns the entry only if it is
// authoritative (>=3 confirmations) AND not stale (age, hit count).
async function tryCacheLookup(question_id: string | undefined, normalised: string) {
  if (!sb || !question_id) return null;
  try {
    const { data, error } = await sb
      .from("accepted_answers")
      .select("id, marks_awarded, feedback, confirmation_count, hit_count, last_verified_at")
      .eq("question_id", question_id)
      .eq("normalised_answer", normalised)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const entry = data[0];
    if ((entry.confirmation_count ?? 0) < CONFIRMATION_THRESHOLD) return null;
    if ((entry.hit_count ?? 0) >= MAX_HITS_BEFORE_REVERIFY) return null;
    const ageDays = (Date.now() - new Date(entry.last_verified_at).getTime()) / 86400000;
    if (ageDays >= MAX_AGE_DAYS_BEFORE_REVERIFY) return null;
    return entry;
  } catch (e) {
    console.error("cache lookup failed:", e);
    return null;
  }
}

// Increment hit_count when serving from cache. Fire-and-forget.
function recordCacheHit(entryId: number) {
  if (!sb) return;
  sb.rpc("increment_accepted_answer_hit", { entry_id: entryId }).then(() => {}).catch(() => {
    // Fallback: direct update if RPC missing
    sb.from("accepted_answers").update({ hit_count: { increment: 1 } as unknown as number }).eq("id", entryId).then(() => {}).catch(() => {});
  });
}

// Direct update via raw SQL through service role (since the RPC may not exist)
async function bumpHitCount(entryId: number) {
  if (!sb) return;
  try {
    await sb.from("accepted_answers").select("hit_count").eq("id", entryId).single().then(async (r) => {
      const next = (r.data?.hit_count ?? 0) + 1;
      await sb.from("accepted_answers").update({ hit_count: next }).eq("id", entryId);
    });
  } catch (e) {
    console.error("hit count update failed:", e);
  }
}

// Either insert a new cache entry, or increment the confirmation_count on an existing one.
async function recordCacheConfirmation(question_id: string, normalised: string, marks_awarded: number, feedback: string) {
  if (!sb || !question_id) return;
  try {
    const existing = await sb
      .from("accepted_answers")
      .select("id, confirmation_count")
      .eq("question_id", question_id)
      .eq("normalised_answer", normalised)
      .eq("marks_awarded", marks_awarded)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.length > 0) {
      const row = existing.data[0];
      await sb.from("accepted_answers").update({
        confirmation_count: (row.confirmation_count ?? 0) + 1,
        last_verified_at: new Date().toISOString(),
        feedback,
      }).eq("id", row.id);
    } else {
      await sb.from("accepted_answers").insert({
        question_id,
        normalised_answer: normalised,
        marks_awarded,
        feedback,
        confirmation_count: 1,
        hit_count: 0,
      });
    }
  } catch (e) {
    console.error("cache confirmation write failed:", e);
  }
}

// Identify the calling pupil from their Supabase JWT. Returns null when there is
// no user token (e.g. older clients that send only the anon apikey), in which
// case the function stays a pure marking endpoint and records nothing.
async function getAuthedUid(req: Request): Promise<string | null> {
  if (!sb) return null;
  const authz = req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await sb.auth.getUser(m[1]);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Write the marked response server-side (service role), but ONLY for the
// authenticated pupil and ONLY in a class they belong to. This is what makes the
// grade authoritative: the stored is_correct / marks_awarded come from here, not
// from a value the browser sent. Returns the new row id, or null if it could not
// be recorded (the caller then just returns the verdict, no response_id).
async function recordResponse(
  uid: string | null,
  question_id: string | undefined,
  class_id: string | undefined,
  student_answer: string,
  verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean },
): Promise<string | null> {
  if (!sb || !uid || !question_id || !class_id) return null;
  try {
    const mem = await sb
      .from("class_members")
      .select("student_id")
      .eq("class_id", class_id)
      .eq("student_id", uid)
      .limit(1);
    if (mem.error || !mem.data || mem.data.length === 0) return null;
    const ins = await sb
      .from("responses")
      .insert({
        student_id: uid,
        question_id,
        class_id,
        student_answer,
        is_correct: verdict.correct,
        marks_awarded: verdict.marks_awarded,
        ai_feedback: verdict.flagged ? "FLAGGED: " + verdict.feedback : verdict.feedback,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) return null;
    return ins.data.id as string;
  } catch (e) {
    console.error("response insert failed:", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { question, model_answer, student_answer, marks, question_id, class_id, prejudged_flagged } = await req.json();

    if (!question || !model_answer || !student_answer) {
      return json({ error: "Missing fields" }, 400);
    }

    const maxMarks = Number(marks) || 1;

    // ── Build the verdict (this is the only place the grade is decided) ──
    let verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean; source: string };

    if (prejudged_flagged) {
      // The client's cheap heuristic flagged this as a non-attempt. Trusting it
      // can only award 0 / mark incorrect, so a cheating client gains nothing —
      // and it saves an AI call on obvious junk.
      verdict = {
        correct: false, marks_awarded: 0,
        feedback: typeof prejudged_flagged === "string" ? prejudged_flagged : "Flagged as a non-attempt.",
        flagged: true, source: "client_flagged",
      };
    } else if (checkNumericalMatch(model_answer, student_answer)) {
      verdict = { correct: true, marks_awarded: maxMarks, feedback: "Correct.", flagged: false, source: "numerical_match" };
    } else {
      const normalised = normalise(student_answer);
      const cached = (question_id && normalised.length > 0) ? await tryCacheLookup(question_id, normalised) : null;
      if (cached) {
        bumpHitCount(cached.id);
        verdict = { correct: true, marks_awarded: cached.marks_awarded, feedback: cached.feedback || "Correct.", flagged: false, source: "cache" };
      } else if (!ANTHROPIC_API_KEY) {
        verdict = { correct: false, marks_awarded: 0, feedback: "AI marking not configured.", flagged: false, source: "fallback" };
      } else {
        const tryWriteCache = async (result: { correct?: boolean; flagged?: boolean; confidence?: string; marks_awarded?: number; feedback?: string }) => {
          if (!question_id) return;
          if (!result.correct || result.flagged) return;
          if (result.confidence !== "high") return;
          if (!passesLengthFloor(student_answer, model_answer)) return;
          const marksAwarded = (typeof result.marks_awarded === "number" ? result.marks_awarded : maxMarks) | 0;
          await recordCacheConfirmation(question_id, normalised, marksAwarded, result.feedback || "Correct.");
        };

        const first = await callAiMark("first", question, model_answer, student_answer, maxMarks);
        if (first.correct || first.flagged) {
          tryWriteCache(first).catch(() => {});
          verdict = { correct: !!first.correct, marks_awarded: first.marks_awarded ?? (first.correct ? maxMarks : 0), feedback: first.feedback || "", flagged: !!first.flagged, source: "ai" };
        } else {
          // Double-check wrong answers — the model is sometimes harsh on first pass.
          let overturned: { correct?: boolean; marks_awarded?: number; feedback?: string } | null = null;
          try {
            const second = await callAiMark("second", question, model_answer, student_answer, maxMarks);
            if (second.correct) { tryWriteCache(second).catch(() => {}); overturned = second; }
          } catch (_) {
            // fall through to the confirmed-wrong verdict
          }
          verdict = overturned
            ? { correct: true, marks_awarded: overturned.marks_awarded ?? maxMarks, feedback: overturned.feedback || "", flagged: false, source: "ai_double_check_overturned" }
            : { correct: !!first.correct, marks_awarded: first.marks_awarded ?? 0, feedback: first.feedback || "", flagged: !!first.flagged, source: "ai_double_check_confirmed" };
        }
      }
    }

    // Clamp to [0, maxMarks] no matter the source.
    let awarded = Number(verdict.marks_awarded);
    if (!Number.isFinite(awarded)) awarded = verdict.correct ? maxMarks : 0;
    verdict.marks_awarded = Math.max(0, Math.min(maxMarks, Math.round(awarded)));

    // ── Record server-side (authenticated pupil, their own class only) ──
    const uid = await getAuthedUid(req);
    const response_id = await recordResponse(uid, question_id, class_id, student_answer, verdict);

    return json({ ...verdict, recorded: response_id !== null, response_id });
  } catch (error) {
    return json({
      correct: false, marks_awarded: 0, feedback: "Marking error — try again.",
      flagged: false, source: "error", recorded: false, response_id: null, error: String(error),
    }, 500);
  }
});
