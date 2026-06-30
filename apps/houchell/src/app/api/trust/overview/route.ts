// Houchell Education — MAT/Trust dashboard data (strategy Build 4).
// GET /api/trust/overview   Authorization: Bearer <teacher JWT>
//
// Returns every school in the caller's trust (via trust_classes(), which only
// answers trust_lead callers), each rolled up to an average mastery + weakest
// objectives, plus a trust-wide weakest-objectives leaderboard. Same mastery
// graph as Builds 2/3 — just one level higher. Aggregates client-side-friendly.
//
// Env: SK_API_KEY (retrieval RPC).

export const runtime = "nodejs";
export const maxDuration = 300;

import { rollupTrust, mapPool, type EnrichedClass } from "@/lib/trustBenchmark";
import { rollupRetrieval, blendObjectiveMastery, crosswalkMap, type AssessmentObjective } from "@/lib/mastery";
import { reportError } from "@/lib/observe";
import { withTimeout, RETRIEVAL_TIMEOUT_MS, SK_ANON, SK_URL } from "@/lib/serverHelpers";

/** Whole days since an ISO date (yyyy-mm-dd), or null. */
function daysSince(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 864e5));
}

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
 *  that class rather than hanging the whole dashboard request. */
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

  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try { profile = (await rest(`profiles?id=eq.${uid}&select=trust_id,trust_role&limit=1`, token))?.[0]; }
  catch (e) { await reportError(e, { route: "trust/overview", phase: "load profile", uid }); return j({ error: "Couldn't load profile" }, 500); }

  if (!profile?.trust_id || profile.trust_role !== "trust_lead") return j({ enabled: false });

  let trustName = "Your trust";
  let joinCode: string | null = null;
  try {
    const t = (await rest(`trusts?id=eq.${profile.trust_id}&select=name,join_code`, token))?.[0];
    if (t?.name) trustName = t.name;
    joinCode = t?.join_code || null;
  } catch { /* default */ }

  // Assessment per-objective mastery across the trust (one cheap RPC) — both modes.
  let assessObjectives: AssessmentObjective[] = [];
  try {
    const rows = await rpc("trust_objective_mastery", { p_min_marked: 5 }, token);
    if (Array.isArray(rows)) assessObjectives = rows;
  } catch { /* assessment data optional */ }

  // Snapshot-first: serve the weekly trust snapshot instantly unless ?live is set.
  const wantLive = new URL(req.url).searchParams.has("live");
  if (!wantLive) {
    let snap: any = null;
    try {
      snap = (await rest(`trust_benchmark_snapshots?trust_id=eq.${profile.trust_id}&select=taken_on,trust_avg,payload&order=taken_on.desc&limit=1`, token))?.[0];
    } catch { /* no snapshot */ }
    if (snap) {
      const snapCohort = snap.payload?.cohort || [];
      const objectiveMastery = blendObjectiveMastery(
        rollupRetrieval([snapCohort.map((o: any) => ({ topic_name: o.topic_name, pct_correct: o.avg, marked: null }))]),
        assessObjectives,
      );
      return j({
        enabled: true, trust: { name: trustName }, joinCode,
        trustAvg: snap.trust_avg ?? null, schools: snap.payload?.schools || [], cohort: snapCohort,
        objectiveMastery, meta: { source: "snapshot", takenOn: snap.taken_on, staleDays: daysSince(snap.taken_on) },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  let classes: any[] = [];
  let xwalk = new Map<string, string>();
  try { classes = await rpc("trust_classes", {}, token); } catch { classes = []; }
  if (!Array.isArray(classes)) classes = [];
  try { xwalk = crosswalkMap(await rest(`topic_objective_map?select=topic_id,objective_id`, token)); } catch { /* no crosswalk yet */ }

  // Aggregate each class's weak objectives (bounded concurrency).
  const enriched: EnrichedClass[] = await mapPool(classes, 8, async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    let weak: any[] = [];
    if (retId) {
      // Timeout + fallback: a slow/down retrieval app degrades this class to no
      // weak topics so the dashboard still loads, rather than hanging the request.
      const rows = await rpcT("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 }, token, secret);
      weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({ topic_id: w.topic_id, topic_name: w.topic_name, objective_id: xwalk.get(w.topic_id) || null, pct_correct: Math.round(Number(w.pct_correct)) }));
    }
    return { school_id: c.school_id, school_name: c.school_name, year_group: c.year_group, linked: !!retId, weak };
  });

  const { schools, cohort, trustAvg } = rollupTrust(enriched);

  // Blend the live retrieval rollup with the trust assessment objectives.
  const objectiveMastery = blendObjectiveMastery(
    rollupRetrieval(enriched.map((c) => c.weak)),
    assessObjectives,
  );

  return j({ enabled: true, trust: { name: trustName }, joinCode, trustAvg, schools, cohort, objectiveMastery, meta: { source: "live" }, generatedAt: new Date().toISOString() });
}
