// Houchell Education — weekly school benchmark snapshots (Vercel Cron).
// GET /api/cron/school-snapshots
// For every school, aggregates its classes' weak objectives from retrieval and
// upserts one snapshot per school per day (school-average + weakest objectives).
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, SK_API_KEY

import { mapPool } from "@/lib/trustBenchmark";
import { cronAuthorized, recordCronRun, withTimeout, RETRIEVAL_TIMEOUT_MS } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "school-snapshots";

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  const secret = process.env.SK_API_KEY || "";
  if (!secret) return j({ error: "SK_API_KEY missing" }, 500);

  const admin = async (path: string) => {
    const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  // Timeout + fallback: a slow/down retrieval app yields [] for that class so the
  // cron skips it and keeps going (partial success), instead of hanging to maxDuration.
  const retRpc = async (fn: string, body: any) => {
    try {
      return await withTimeout((signal) => fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
        method: "POST", signal,
        headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}`, "x-sciencekit-key": secret },
        body: JSON.stringify(body),
      }).then((r) => (r.ok ? r.json() : [])), RETRIEVAL_TIMEOUT_MS);
    } catch (e: any) { console.warn(`school-snapshots retRpc ${fn} failed: ${e?.message || e}`); return []; }
  };

  const startedAt = new Date().toISOString();

  let schools: any[];
  try { schools = await admin("schools?select=id,name"); }
  catch (e: any) {
    await reportError(e, { route: JOB, phase: "load schools" });
    await recordCronRun(JOB, { startedAt, ok: false, processed: 0, failed: 0, notes: `load schools: ${e.message}` });
    return j({ error: `load schools: ${e.message}` }, 500);
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];

  for (const s of schools || []) {
    try {
      const profiles = await admin(`profiles?school_id=eq.${s.id}&select=id`);
      const teacherIds = profiles.map((p: any) => p.id);
      if (!teacherIds.length) { results.push({ school: s.name, skipped: "no staff" }); continue; }
      const classes = await admin(`classes?teacher_id=in.(${teacherIds.join(",")})&archived=eq.false&select=id,retrieval_class_ids`);

      const perClass = await mapPool(classes || [], 8, async (c: any) => {
        const retId = (c.retrieval_class_ids || [])[0];
        if (!retId) return { avg: null as number | null, weak: [] as any[] };
        const rows = await retRpc("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 });
        const weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({ topic_id: w.topic_id, topic_name: w.topic_name, pct: Math.round(Number(w.pct_correct)) }));
        const avg = weak.length ? Math.round(weak.reduce((a, w) => a + w.pct, 0) / weak.length) : null;
        return { avg, weak };
      });

      const avgs = perClass.map((c) => c.avg).filter((v): v is number => v != null);
      const schoolAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;

      const tally = new Map<string, { name: string; sum: number; n: number; classes: number }>();
      for (const c of perClass) for (const w of c.weak) {
        const e = tally.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0, classes: 0 };
        e.sum += w.pct; e.n += 1; e.classes += 1; tally.set(w.topic_id, e);
      }
      const objectives = [...tally.values()].map((e) => ({ topic_name: e.name, avg: Math.round(e.sum / e.n), classes: e.classes })).sort((a, b) => a.avg - b.avg).slice(0, 12);

      const r = await fetch(`${SK_URL}/rest/v1/school_benchmark_snapshots?on_conflict=school_id,taken_on`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ school_id: s.id, taken_on: today, school_avg: schoolAvg, payload: { objectives } }),
      });
      if (!r.ok) throw new Error(`write: ${r.status}`);
      results.push({ school: s.name, schoolAvg, ok: true });
    } catch (e: any) {
      await reportError(e, { route: JOB, school: s.name });
      results.push({ school: s.name, error: e.message });
    }
  }

  const processed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.error).length;
  await recordCronRun(JOB, { startedAt, ok: failed === 0, processed, failed, notes: `${processed} snapshotted, ${failed} failed of ${results.length}` });
  return j({ date: today, snapshotted: processed, results });
}
