// Houchell Education — home-course (Springboard) sync helpers (server-only).
// Thin service-role REST wrappers + state summarising, shared by the
// /api/springboard/* routes. Mirrors the direct-fetch style of the parent portal.

import { SK_URL } from "@/lib/serverHelpers";

/** Per-pupil link token: URL-safe, 16–64 chars (we mint 24). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const svcKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const headers = () => ({ apikey: svcKey(), Authorization: `Bearer ${svcKey()}`, "content-type": "application/json" });

/** Service-role GET against PostgREST; returns the parsed array. Throws on non-OK. */
export async function sbGet(path: string): Promise<any[]> {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** Service-role write (POST/PATCH). `prefer` lets callers upsert
 *  (resolution=merge-duplicates) or skip the body (return=minimal). */
export async function sbWrite(method: string, path: string, body: unknown, prefer = "return=representation"): Promise<any> {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    method, headers: { ...headers(), Prefer: prefer }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// ─── Valid Springboard unit codes (crosswalk cache) ───────────────────────
// The set of REAL unit codes lives in the springboard_objective_map crosswalk
// (20260629_springboard_objective_mastery migration). We fetch it once per WARM
// serverless instance and cache it — the crosswalk is small (~30 rows) and changes
// only on a migration, so a short TTL is plenty and keeps every mastery write from
// re-querying it. A failed fetch returns null (caller then skips unit validation
// rather than dropping all data — fail-open on a transient crosswalk error).
let _unitCache: { at: number; set: Set<string> } | null = null;
const UNIT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min per warm instance

export async function validUnitCodes(): Promise<Set<string> | null> {
  const now = Date.now();
  if (_unitCache && now - _unitCache.at < UNIT_CACHE_TTL_MS) return _unitCache.set;
  try {
    const rows = await sbGet("springboard_objective_map?select=unit_code");
    const set = new Set<string>();
    for (const r of rows || []) { if (r?.unit_code) set.add(String(r.unit_code)); }
    // An empty crosswalk would drop everything; treat "no rows" as "can't validate"
    // (return null → fail-open) so an un-backfilled crosswalk doesn't lose all writes.
    if (set.size === 0) return null;
    _unitCache = { at: now, set };
    return set;
  } catch {
    return null;
  }
}

/** Most-recent answered_at for a pupil's mastery rows (ISO string), or null if none.
 *  Used by the mastery route as a serverless-friendly min-interval write throttle:
 *  there's no shared in-memory limiter across lambda instances, so we read the last
 *  write time straight from the data we already keep (no extra column/table needed). */
export async function lastMasteryWriteAt(studentId: string): Promise<string | null> {
  try {
    const rows = await sbGet(
      `springboard_response?student_id=eq.${encodeURIComponent(studentId)}&select=answered_at&order=answered_at.desc&limit=1`,
    );
    return rows?.[0]?.answered_at ?? null;
  } catch {
    return null; // can't read → don't block the write (fail-open on a transient error)
  }
}

/** One per-question outcome the client batches up to the mastery endpoint.
 *  qid is the course's own id "<unitCode>#<questionIndex>" (e.g. "B1#3"); the
 *  unitCode is derived from it server-side, so the client can't spoof a mismatch. */
export type AnswerSignal = {
  qid: string;
  correct: boolean;
  session?: string;         // 'lesson' | 'review' | 'weak' | 'recap' | 'exam'
  at?: string;              // ISO timestamp (optional; server defaults to now)
};

/** qid shape: 1+ non-'#' chars (the unit code), '#', then a question index. */
const QID_RE = /^([^#]{1,32})#(\d{1,6})$/;
const SESSIONS = new Set(["lesson", "review", "weak", "recap", "exam"]);

/** Validate + normalise a batch of answer signals into springboard_response rows
 *  for a pupil. Drops anything malformed (never throws) so one bad item can't sink
 *  the batch. unit_code is taken from the qid prefix, not trusted from the client.
 *
 *  `validUnits` (optional): the set of REAL Springboard unit codes from the
 *  springboard_objective_map crosswalk. When provided, any answer whose unit_code
 *  isn't a known unit is DROPPED — this stops a token holder inflating mastery with
 *  fabricated unit codes that would never roll up to an objective anyway.
 *  Validation is at UNIT grain only: the per-question content (the question text /
 *  index) lives client-side in the static springboard.html, so the server has no way
 *  to confirm a given question index exists — unit membership is the strongest check
 *  it can make. When `validUnits` is omitted (e.g. crosswalk unavailable) we fall
 *  back to the previous behaviour (accept any well-formed qid) rather than dropping
 *  everything, so a crosswalk fetch hiccup can't silently lose all self-study data. */
export function toResponseRows(
  studentId: string,
  signals: unknown,
  validUnits?: Set<string> | null,
): Array<{ student_id: string; unit_code: string; qid: string; is_correct: boolean; session: string; answered_at: string }> {
  if (!Array.isArray(signals)) return [];
  const rows: Array<{ student_id: string; unit_code: string; qid: string; is_correct: boolean; session: string; answered_at: string }> = [];
  const seen = new Set<string>();
  for (const raw of signals.slice(0, 500)) {                 // hard cap per batch
    const a = raw as AnswerSignal;
    if (!a || typeof a.qid !== "string" || typeof a.correct !== "boolean") continue;
    const m = QID_RE.exec(a.qid);
    if (!m) continue;
    // Drop fabricated unit codes when we have the crosswalk to validate against.
    if (validUnits && !validUnits.has(m[1])) continue;
    if (seen.has(a.qid)) continue;                            // de-dupe within the batch (upsert keeps latest)
    seen.add(a.qid);
    let at = new Date().toISOString();
    if (typeof a.at === "string") { const d = new Date(a.at); if (!isNaN(d.getTime())) at = d.toISOString(); }
    rows.push({
      student_id: studentId,
      unit_code: m[1],
      qid: a.qid,
      is_correct: a.correct,
      session: typeof a.session === "string" && SESSIONS.has(a.session) ? a.session : "lesson",
      answered_at: at,
    });
  }
  return rows;
}

/** Pull the cheap dashboard summary out of the course's State blob. A "crown" is a
 *  completed lesson node (ids look like "<unitCode>-L<n>"); review/weak sessions
 *  (ids "review-…"/"weak-…") don't count. */
export function summarise(state: any): { xp: number; streak: number; words: number; crowns: number } {
  const lessons = (state && state.lessons) || {};
  // A crown is a completed *lesson* node "<unitCode>-L<n>". Explicitly exclude
  // review/weak/recap session ids by prefix so the count can't be inflated if one
  // of those is ever named with a "-L<n>" suffix (the bare /-L\d+$/ regex would
  // otherwise match e.g. "review-L1").
  let crowns = 0;
  for (const k in lessons) {
    if (!lessons[k] || !lessons[k].done) continue;
    if (/^(review|weak|recap)-/.test(k)) continue;
    if (/-L\d+$/.test(k)) crowns++;
  }
  return {
    xp: Number(state?.xp) || 0,
    streak: Number(state?.streak) || 0,
    words: Number(state?.words) || 0,
    crowns,
  };
}
