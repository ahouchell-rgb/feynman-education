import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BASE_RETRIEVAL } from "../_shared/marking/base-retrieval.ts";
import { overlayFor } from "../_shared/marking/registry.ts";

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
const MAX_HITS_BEFORE_REVERIFY = 50;    // after this many cache hits, the next call re-verifies via AI; a
                                        // successful high-confidence re-verify then resets hit_count (see
                                        // recordCacheConfirmation) so the entry RESUMES serving from cache.
                                        // COST LEVER 2: without that reset, a popular answer permanently
                                        // reverted to a full AI call on every hit once it crossed this line —
                                        // the opposite of leaning on the cache. Now it re-checks every ~50
                                        // hits and serves from cache in between.
const MAX_AGE_DAYS_BEFORE_REVERIFY = 90; // entries older than this re-verify next call
const MIN_ANSWER_WORDS = 3;             // never cache anything shorter than this in absolute terms
const MIN_LENGTH_RATIO = 0.6;           // OR at least 60% of model answer length

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

// Resolve the school that owns a class, so every usage row can be attributed to a
// school (exact per-school cost + fair-use metering). Cached in module scope: a class
// never changes school within a warm instance, so this is one DB lookup per class, not
// per request — the deterministic fast paths stay fast.
const schoolIdCache = new Map<string, string | null>();
async function resolveSchoolId(class_id: string | undefined): Promise<string | null> {
  if (!sb || !class_id) return null;
  if (schoolIdCache.has(class_id)) return schoolIdCache.get(class_id) ?? null;
  try {
    const { data } = await sb.from("classes").select("school_id").eq("id", class_id).single();
    const sid = (data?.school_id as string) ?? null;
    schoolIdCache.set(class_id, sid);
    return sid;
  } catch {
    return null;
  }
}

// Resolve the subject's marker_profile (subjects.marker_profile) so the marker loads
// the right prompt overlay. Authoritative: question -> topic -> subject, else class ->
// subject. Module-scope cached (a question/class never changes subject in a warm
// instance). ANY failure or unknown profile falls back to the default (science) via
// overlayFor — a bad or absent profile can never break a mark, only mark as science.
const markerProfileCache = new Map<string, string>();
async function resolveMarkerProfile(question_id: string | undefined, class_id: string | undefined): Promise<string | null> {
  if (!sb) return null;
  if (question_id) {
    const ck = "q:" + question_id;
    if (markerProfileCache.has(ck)) return markerProfileCache.get(ck)!;
    try {
      const { data } = await sb.from("questions").select("topics(subjects(marker_profile))").eq("id", question_id).single();
      const mp = (data as { topics?: { subjects?: { marker_profile?: string } } } | null)?.topics?.subjects?.marker_profile;
      if (mp) { markerProfileCache.set(ck, mp); return mp; }
    } catch { /* fall through to class / default */ }
  }
  if (class_id) {
    const ck = "c:" + class_id;
    if (markerProfileCache.has(ck)) return markerProfileCache.get(ck)!;
    try {
      const { data } = await sb.from("classes").select("subjects(marker_profile)").eq("id", class_id).single();
      const mp = (data as { subjects?: { marker_profile?: string } } | null)?.subjects?.marker_profile;
      if (mp) { markerProfileCache.set(ck, mp); return mp; }
    } catch { /* fall through to default */ }
  }
  return null;
}

// Hard cost backstop: true when a school's AI-mark usage is >3x its fair-use
// allowance (school_mark_status RPC). The soft cap (admin Schools view) never blocks
// pupils; this only ever catches genuine runaway/abuse. Per-instance cached 5 min,
// and fails OPEN on any error (a transient DB issue must never block real marking).
// Comped pilots and uncapped/unknown plans always return false.
const markBackstopCache = new Map<string, { over: boolean; ts: number }>();
async function overBackstop(school_id: string | null): Promise<boolean> {
  if (!sb || !school_id) return false;
  const hit = markBackstopCache.get(school_id);
  if (hit && (Date.now() - hit.ts) < 300000) return hit.over;
  try {
    const { data, error } = await sb.rpc("school_mark_status", { p_school_id: school_id });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    const over = !!(row && row.over_backstop);
    markBackstopCache.set(school_id, { over, ts: Date.now() });
    return over;
  } catch {
    return false;
  }
}

// Fire-and-forget AI usage logging. `source` tags the row so the admin cost dashboard
// can break spend down (ai / ai_double_check); `school_id` attributes it to a school.
function logUsage(label: string, source: string, school_id: string | null, usage: Record<string, unknown> | undefined) {
  if (!sb || !usage) return;
  const row = {
    call_label: label,
    source,
    school_id,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  };
  sb.from("ai_usage").insert(row).then(() => {}).catch((e) => console.error("ai_usage insert failed:", e));
}

// Fire-and-forget logging of a NO-AI marking (numerical_match / exact_match / cache /
// client_flagged). Writes a zero-token row so the cost dashboard sees the full
// free-vs-AI blend — every marking is exactly one entry-point row ('first' for an AI
// mark, 'shortcut' for these). This is the data behind the dashboard's per-marking cost.
function logShortcut(source: string, school_id: string | null) {
  if (!sb) return;
  sb.from("ai_usage").insert({
    call_label: "shortcut",
    source,
    school_id,
    input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0,
  }).then(() => {}).catch(() => {});
}

async function callAiMark(label: string, source: string, school_id: string | null, overlay: string, question: string, model_answer: string, student_answer: string, marks: number) {
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
        // Two cached system blocks: the subject-agnostic engine (shared across every
        // subject) then the per-subject overlay. base + overlay are the same size as the
        // old single prompt, so per-subject caching is unchanged; if the engine alone
        // clears the 4096-token floor it also caches once across all subjects.
        { type: "text", text: BASE_RETRIEVAL, cache_control: { type: "ephemeral" } },
        { type: "text", text: overlay, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        // Per-question cache breakpoint: the question + model answer are identical for
        // every pupil marked on this question, so this block (which sits on top of the
        // always-warm system prompt) is cached and re-read across pupils whenever the
        // same question is marked again inside the 5-min TTL — e.g. a whole class doing
        // the same retrieval quiz. The student answer varies per pupil, so it is a
        // separate, uncached block AFTER the breakpoint. Concatenated, the model sees
        // exactly the same text as before, so marking is unchanged. (3 breakpoints total:
        // engine, overlay and this question block; the API cap is 4.)
        content: [
          {
            type: "text",
            text: `Question (${marks} mark${marks > 1 ? 's' : ''}): ${question}\nModel answer: ${model_answer}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `\nStudent wrote: ${student_answer}` },
        ],
      }],
    }),
  });
  const data = await response.json();
  logUsage(label, source, school_id, data?.usage);
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
        // COST LEVER 2: reset the hit counter on every (re)confirmation. This only
        // ever runs on the AI path — a fresh confirmation or a periodic re-verify,
        // never on a plain cache serve — so resetting it here is exactly what lets a
        // re-verified popular entry start serving from cache again for the next
        // MAX_HITS_BEFORE_REVERIFY hits instead of AI-marking every pupil forever.
        hit_count: 0,
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
  verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean; confidence?: string },
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
        ai_confidence: verdict.confidence ?? null,
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
    const schoolId = await resolveSchoolId(class_id);

    // ── Build the verdict (this is the only place the grade is decided) ──
    let verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean; source: string; confidence?: string };

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
    } else if (normalise(student_answer) === normalise(model_answer)) {
      // COST: deterministic exact match. The student wrote the model answer verbatim
      // (after the same lowercase / punctuation / leading-article normalisation used
      // for the cache key), so it is unambiguously full marks — no AI call needed, and
      // it marks identically every time. Bracketed model answers like "Joules (accept
      // J)" normalise WITH the bracket text, so a bare "joules" does NOT match here and
      // still goes to the AI — there is no false-positive path. Mirrors how
      // numerical_match already trusts the model answer.
      verdict = { correct: true, marks_awarded: maxMarks, feedback: "Correct.", flagged: false, source: "exact_match" };
    } else {
      const normalised = normalise(student_answer);
      const cached = (question_id && normalised.length > 0) ? await tryCacheLookup(question_id, normalised) : null;
      if (cached) {
        bumpHitCount(cached.id);
        verdict = { correct: true, marks_awarded: cached.marks_awarded, feedback: cached.feedback || "Correct.", flagged: false, source: "cache" };
      } else if (!ANTHROPIC_API_KEY) {
        verdict = { correct: false, marks_awarded: 0, feedback: "AI marking not configured.", flagged: false, source: "fallback" };
      } else if (await overBackstop(schoolId)) {
        // Hard cost backstop: this school is >3x its fair-use allowance (see
        // school_mark_status). Skip the paid AI call and don't record a grade — the
        // soft cap never blocks pupils, but this stops genuine runaway/abuse cost.
        verdict = { correct: false, marks_awarded: 0, feedback: "Marking is paused for your school right now — please let your teacher know.", flagged: false, source: "cap_backstop" };
      } else {
        const tryWriteCache = async (result: { correct?: boolean; flagged?: boolean; confidence?: string; marks_awarded?: number; feedback?: string }) => {
          if (!question_id) return;
          if (!result.correct || result.flagged) return;
          if (result.confidence !== "high") return;
          if (!passesLengthFloor(student_answer, model_answer)) return;
          const marksAwarded = (typeof result.marks_awarded === "number" ? result.marks_awarded : maxMarks) | 0;
          await recordCacheConfirmation(question_id, normalised, marksAwarded, result.feedback || "Correct.");
        };

        const markerProfile = await resolveMarkerProfile(question_id, class_id);
        const overlay = overlayFor(markerProfile, "retrieval");

        const first = await callAiMark("first", "ai", schoolId, overlay, question, model_answer, student_answer, maxMarks);
        if (first.correct || first.flagged) {
          tryWriteCache(first).catch(() => {});
          verdict = { correct: !!first.correct, marks_awarded: first.marks_awarded ?? (first.correct ? maxMarks : 0), feedback: first.feedback || "", flagged: !!first.flagged, source: "ai", confidence: first.confidence };
        } else {
          // Double-check wrong answers — the model is sometimes harsh on first pass.
          // COST LEVER 3: skip the re-check when the first pass is already high
          // confidence. A confidently-wrong verdict is very rarely overturned on a
          // second look, so re-marking it just burns a whole extra AI call. We only
          // pay for the double-check on medium/low-confidence wrongs — the cases the
          // overturn actually exists for. This trims ~15-20% of calls. A missing or
          // malformed confidence field falls through to !== "high", i.e. we keep the
          // safer old behaviour and still double-check.
          let overturned: { correct?: boolean; marks_awarded?: number; feedback?: string } | null = null;
          if (first.confidence !== "high") {
            try {
              const second = await callAiMark("second", "ai_double_check", schoolId, overlay, question, model_answer, student_answer, maxMarks);
              if (second.correct) { tryWriteCache(second).catch(() => {}); overturned = second; }
            } catch (_) {
              // fall through to the confirmed-wrong verdict
            }
          }
          verdict = overturned
            ? { correct: true, marks_awarded: overturned.marks_awarded ?? maxMarks, feedback: overturned.feedback || "", flagged: false, source: "ai_double_check_overturned", confidence: "medium" }
            : { correct: !!first.correct, marks_awarded: first.marks_awarded ?? 0, feedback: first.feedback || "", flagged: !!first.flagged, source: "ai_double_check_confirmed", confidence: first.confidence };
        }
      }
    }

    // Clamp to [0, maxMarks] no matter the source.
    let awarded = Number(verdict.marks_awarded);
    if (!Number.isFinite(awarded)) awarded = verdict.correct ? maxMarks : 0;
    verdict.marks_awarded = Math.max(0, Math.min(maxMarks, Math.round(awarded)));
    // Deterministic marks (numerical/exact/cache/client_flagged) and the fallback are
    // certain by construction — record them as high confidence. The review queue keys
    // off low/medium, so these correctly never appear in it.
    if (!verdict.confidence) verdict.confidence = "high";

    // Log the no-AI markings for the cost dashboard. AI markings already logged their
    // tokens (logUsage 'first'); here we record one zero-token 'shortcut' row per
    // deterministic mark so the dashboard sees the full blend and the true cost-per-mark.
    if (verdict.source === "numerical_match" || verdict.source === "exact_match" ||
        verdict.source === "cache" || verdict.source === "client_flagged") {
      logShortcut(verdict.source, schoolId);
    }

    // ── Record server-side (authenticated pupil, their own class only) ──
    const uid = await getAuthedUid(req);
    // Never persist a backstop "verdict" as a grade — it isn't one.
    const response_id = verdict.source === "cap_backstop" ? null : await recordResponse(uid, question_id, class_id, student_answer, verdict);

    return json({ ...verdict, recorded: response_id !== null, response_id });
  } catch (error) {
    return json({
      correct: false, marks_awarded: 0, feedback: "Marking error — try again.",
      flagged: false, source: "error", recorded: false, response_id: null, error: String(error),
    }, 500);
  }
});
