// Houchell Education — SLT intervention list (Build 2 action layer).
// GET /api/school/intervention?threshold=50   Authorization: Bearer <teacher JWT>
//
// Returns the pupils below a mastery threshold per objective, across the school's
// classes — the actionable "who needs support on what" list an SLT exports for
// intervention groups / Pupil Premium tracking.
//
// PERSONAL DATA: unlike the aggregate dashboard, this is pupil-level. It is
// restricted to slt (not hod), and the school's lawful basis for intervention
// applies. The per-pupil read uses a retrieval-side RPC:
//
//   class_intervention_list(p_class_id uuid, p_threshold int) RETURNS TABLE(
//     student_id uuid, student_name text, topic_id uuid, topic_name text,
//     pct_correct numeric, marked int)
//   — same x-sciencekit-key gating as class_weak_topics; lives in the retrieval
//   repo. Until it ships this route returns enabled:true with no rows + a note.

import { mapPool } from "@/lib/trustBenchmark";
import { withTimeout, RETRIEVAL_TIMEOUT_MS, SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";
export const maxDuration = 120;

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
async function rpc(fn: string, body: any, bearer: string, secret?: string) {
  const r = await fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${bearer}`, ...(secret ? { "x-sciencekit-key": secret } : {}) },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}
/** Retrieval RPC with a hard timeout — a slow/down retrieval app yields [] for
 *  that class rather than hanging the whole request. */
async function rpcT(fn: string, body: any, bearer: string, secret?: string) {
  try {
    return await withTimeout((signal) => fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${bearer}`, ...(secret ? { "x-sciencekit-key": secret } : {}) },
      body: JSON.stringify(body),
    }).then((r) => (r.ok ? r.json() : [])), RETRIEVAL_TIMEOUT_MS);
  } catch { return []; }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  const secret = process.env.SK_API_KEY || undefined;
  const params = new URL(req.url).searchParams;
  const threshold = Math.max(10, Math.min(90, Number(params.get("threshold")) || 50));
  // Optional drill-down: an SLT clicks a weak objective in the dashboard and
  // jumps straight to the pupils on THAT objective (case-insensitive match).
  const topicFilter = (params.get("topic") || "").trim().toLowerCase();

  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try { profile = (await rest(`profiles?id=eq.${uid}&select=school_id,school_role&limit=1`, token))?.[0]; }
  catch { return j({ error: "Couldn't load profile" }, 500); }

  // Pupil-level data: senior leaders only.
  if (!profile?.school_id || profile.school_role !== "slt") return j({ enabled: false });

  let classes: any[] = [];
  try { classes = await rpc("school_classes", {}, token); } catch { classes = []; }
  if (!Array.isArray(classes)) classes = [];

  const perClass = await mapPool(classes, 6, async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    if (!retId) return [];
    const rows = await rpcT("class_intervention_list", { p_class_id: retId, p_threshold: threshold }, token, secret);
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      class_name: c.name, teacher_name: c.teacher_name, year_group: c.year_group,
      student_name: r.student_name, topic_name: r.topic_name,
      pct_correct: Math.round(Number(r.pct_correct)), marked: r.marked ?? null,
    }));
  });
  let rows = perClass.flat();
  if (topicFilter) rows = rows.filter((r) => (r.topic_name || "").toLowerCase().includes(topicFilter));

  // Group by objective for the on-screen summary.
  const byObjMap = new Map<string, { topic_name: string; pupils: number; sum: number }>();
  for (const r of rows) {
    const e = byObjMap.get(r.topic_name) || { topic_name: r.topic_name, pupils: 0, sum: 0 };
    e.pupils += 1; e.sum += r.pct_correct; byObjMap.set(r.topic_name, e);
  }
  const byObjective = [...byObjMap.values()]
    .map((e) => ({ topic_name: e.topic_name, pupils: e.pupils, avg: Math.round(e.sum / e.pupils) }))
    .sort((a, b) => b.pupils - a.pupils);

  return j({
    enabled: true, threshold, topic: topicFilter || undefined, total: rows.length, byObjective, rows,
    note: rows.length ? undefined : "No pupils below threshold yet (or the class_intervention_list RPC isn't deployed).",
  });
}
