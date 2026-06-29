// Houchell Education — SLT/Department dashboard data (strategy Build 2).
// GET /api/school/overview   Authorization: Bearer <teacher JWT>
//
// Returns the caller's school + every class in it (via the security-definer
// school_classes() RPC, which itself only answers hod/slt callers) with each
// class's weakest objectives aggregated from retrieval. The dashboard does the
// cohort roll-up + filtering client-side from this compact payload.
//
// Aggregation reuses class_weak_topics (the same RPC the feedforward cron uses),
// called server-side with the x-sciencekit-key secret so it doesn't depend on
// client-side RPC gating. No personal pupil rows cross the wire — only
// per-objective aggregates.
//
// Env: SK_API_KEY (retrieval RPC). SUPABASE_SERVICE_ROLE_KEY not required.

export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
import { rollupRetrieval, blendObjectiveMastery, crosswalkMap, type AssessmentObjective } from "@/lib/mastery";
import { reportError } from "@/lib/observe";
import { mapPool } from "@/lib/trustBenchmark";
import { withTimeout, RETRIEVAL_TIMEOUT_MS } from "@/lib/serverHelpers";

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

  // Resolve the caller and their staff role.
  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try {
    profile = (await rest(`profiles?id=eq.${uid}&select=school_id,school_role&limit=1`, token))?.[0];
  } catch (e) { await reportError(e, { route: "school/overview", phase: "load profile", uid }); return j({ error: "Couldn't load profile" }, 500); }

  const role = profile?.school_role || "member";
  if (!profile?.school_id || (role !== "hod" && role !== "slt")) {
    return j({ enabled: false, role });
  }

  // School name + join code + trust link (RLS lets a member read their own school).
  let schoolName = "Your school";
  let joinCode: string | null = null;
  let homeSponsored = false;
  let trust: { linked: boolean; name?: string } = { linked: false };
  try {
    const s = (await rest(`schools?id=eq.${profile.school_id}&select=name,join_code,trust_id,home_sponsored`, token))?.[0];
    if (s?.name) schoolName = s.name;
    homeSponsored = !!s?.home_sponsored;
    if (role === "slt") joinCode = s?.join_code || null;
    if (s?.trust_id) {
      trust.linked = true;
      try { trust.name = (await rest(`trusts?id=eq.${s.trust_id}&select=name`, token))?.[0]?.name; } catch { /* RLS may hide it */ }
    }
  } catch { /* keep defaults */ }

  // Assessment per-objective mastery (one cheap RPC) — used in both modes.
  let assessObjectives: AssessmentObjective[] = [];
  try {
    const rows = await rpc("school_objective_mastery", { p_min_marked: 5 }, token);
    if (Array.isArray(rows)) assessObjectives = rows;
  } catch { /* assessment data optional */ }

  // Snapshot-first: serve the weekly snapshot instantly unless ?live is set.
  // The per-class grid is the expensive fan-out (O(classes) retrieval calls), so
  // it's live-only — the page paints from the snapshot, then hydrates with ?live.
  const wantLive = new URL(req.url).searchParams.has("live");
  if (!wantLive) {
    let snap: any = null;
    try {
      snap = (await rest(`school_benchmark_snapshots?school_id=eq.${profile.school_id}&select=taken_on,school_avg,payload&order=taken_on.desc&limit=1`, token))?.[0];
    } catch { /* no snapshot table / row */ }
    if (snap) {
      const snapObjectives = (snap.payload?.objectives || []).map((o: any) => ({
        topic_name: o.topic_name, pct_correct: o.avg, marked: null, classes: o.classes,
      }));
      const objectiveMastery = blendObjectiveMastery(
        rollupRetrieval([snapObjectives]),
        assessObjectives,
      );
      return j({
        enabled: true, role, school: { name: schoolName }, joinCode, homeSponsored, trust,
        years: [], classes: [], cohort: snap.payload?.objectives || [], schoolAvg: snap.school_avg ?? null,
        objectiveMastery, meta: { source: "snapshot", takenOn: snap.taken_on, staleDays: daysSince(snap.taken_on) },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // Live path: school-wide classes (security-definer RPC; [] unless hod/slt) +
  // per-class retrieval aggregation in parallel. The topic→objective crosswalk
  // lets the blend join retrieval to assessment on ids (name is the fallback).
  let classes: any[] = [];
  let xwalk = new Map<string, string>();
  try { classes = await rpc("school_classes", {}, token); } catch { classes = []; }
  if (!Array.isArray(classes)) classes = [];
  try { xwalk = crosswalkMap(await rest(`topic_objective_map?select=topic_id,objective_id`, token)); } catch { /* no crosswalk yet */ }

  const enriched = await mapPool(classes, 8, async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    let weak: any[] = [];
    if (retId) {
      // Timeout + fallback: a slow/down retrieval app degrades this class to no
      // weak topics so the page still loads, rather than hanging the request.
      const rows = await rpcT("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 }, token, secret);
      weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({
        topic_id: w.topic_id, topic_name: w.topic_name, objective_id: xwalk.get(w.topic_id) || null,
        pct_correct: Math.round(Number(w.pct_correct)), marked: w.marked ?? null, students: w.students ?? null,
      }));
    }
    return {
      class_id: c.class_id, name: c.name, year_group: c.year_group,
      discipline: c.discipline, tier: c.tier, teacher_name: c.teacher_name,
      linked: !!retId, weak,
    };
  });

  const objectiveMastery = blendObjectiveMastery(
    rollupRetrieval(enriched.map((c) => c.weak)),
    assessObjectives,
  );

  const years = [...new Set(enriched.map((c) => c.year_group).filter(Boolean))].sort((a, b) => a - b);
  return j({
    enabled: true, role, school: { name: schoolName }, joinCode, homeSponsored, trust,
    years, classes: enriched, objectiveMastery, meta: { source: "live" },
    generatedAt: new Date().toISOString(),
  });
}
