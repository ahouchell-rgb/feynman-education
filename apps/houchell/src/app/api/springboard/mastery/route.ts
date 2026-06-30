// Houchell Education — Springboard per-answer mastery signals.
//   POST /api/springboard/mastery?t=<token>  { answers:[{qid,correct,session?,at?}] }
//                                            → { ok:true, written:<n> }
//
// This is the additive sibling of /api/springboard/progress. progress keeps syncing
// the whole opaque `state` blob (cross-device save) UNCHANGED; THIS route translates
// the pupil's per-question outcomes into objective-level mastery rows so self-study
// feeds the SAME per-pupil × per-objective mastery graph the retrieval app builds
// (springboard_response → springboard_objective_map → objectives; see the
// 20260629_springboard_objective_mastery migration).
//
// The pupil is identified ONLY by their personal link token (resolved to a
// springboard student_id with the service role) — no login, same trust model as
// /progress. Rows are upserted on (student_id, qid) so re-answering in review just
// updates the latest outcome. Malformed items are dropped (never throw).
//
// HARDENING against a token holder abusing this write path:
//   * Unit validation — each answer's unit_code (derived from its qid prefix) must
//     be a REAL Springboard unit per the springboard_objective_map crosswalk;
//     fabricated units are dropped so they can't inflate the mastery graph.
//   * Write throttle — answers-per-batch is capped and a per-pupil min interval is
//     enforced between writes (→ 429). See the cap constants below for the
//     serverless tradeoff. Both are belt-and-braces on the already token-gated,
//     isolated-table, body-size-capped route.
//
// Env: SUPABASE_SERVICE_ROLE_KEY.

import { json } from "@/lib/serverHelpers";
import { sbGet, sbWrite, toResponseRows, validUnitCodes, lastMasteryWriteAt, TOKEN_RE } from "@/lib/springboard";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024; // a batch is a few hundred small objects at most

// ─── Write-throttle / abuse caps ──────────────────────────────────────────
// The route is token-gated and writes only to the isolated springboard_response
// table, but a token holder could still spam it. Two lightweight caps:
//   1. MAX_ANSWERS_PER_BATCH — reject an oversized batch outright (a real review
//      session is a few dozen answers; even a whole unit is well under this).
//   2. MIN_WRITE_INTERVAL_MS — a per-pupil min interval between writes. Serverless
//      has no shared memory for a classic in-memory limiter, so instead of adding a
//      new column/table we read the pupil's most-recent answered_at from the rows we
//      already store and reject writes that arrive too soon after the last one.
// TRADEOFF: answered_at is client-supplied per row (it can backdate `at`), but the
//   throttle reads the MAX stored answered_at, and a fresh legit batch always
//   advances it to ~now, so a spammer can't dodge the interval by sending old
//   timestamps without also making their own data stale. It's a coarse,
//   best-effort throttle (one extra small read per write, no new schema), not a
//   hard token-bucket — good enough to stop runaway spam from a single token.
const MAX_ANSWERS_PER_BATCH = 200;
const MIN_WRITE_INTERVAL_MS = 2000;

async function pupilByToken(token: string) {
  const rows = await sbGet(`springboard_pupil?token=eq.${encodeURIComponent(token)}&select=student_id&limit=1`);
  return rows?.[0] || null;
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!TOKEN_RE.test(t)) return json({ error: "invalid link" }, 400);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (JSON.stringify(body ?? null).length > MAX_BODY_BYTES) return json({ error: "batch too large" }, 413);

  // Cap the answers-per-batch BEFORE any DB work so an abusive client is cheap to reject.
  if (Array.isArray(body?.answers) && body.answers.length > MAX_ANSWERS_PER_BATCH) {
    return json({ error: "too many answers in one batch" }, 429);
  }

  let pupil;
  try { pupil = await pupilByToken(t); } catch { return json({ error: "lookup failed" }, 500); }
  if (!pupil) return json({ error: "not found" }, 404);

  // Per-pupil min-interval throttle: reject writes that arrive too soon after the
  // last one (see the note above for the serverless tradeoff).
  const last = await lastMasteryWriteAt(pupil.student_id);
  if (last) {
    const since = Date.now() - new Date(last).getTime();
    if (since >= 0 && since < MIN_WRITE_INTERVAL_MS) return json({ error: "too many requests" }, 429);
  }

  // Validate unit codes against the crosswalk (cached per warm instance); fabricated
  // units are dropped. Null ⇒ crosswalk unavailable → skip unit validation (fail-open).
  const units = await validUnitCodes();
  const rows = toResponseRows(pupil.student_id, body?.answers, units);
  if (rows.length === 0) return json({ ok: true, written: 0 });

  try {
    await sbWrite(
      "POST",
      "springboard_response?on_conflict=student_id,qid",
      rows,
      "resolution=merge-duplicates,return=minimal",
    );
  } catch { return json({ error: "save failed" }, 502); }
  return json({ ok: true, written: rows.length });
}
