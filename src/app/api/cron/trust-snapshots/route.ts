// Feynman Education — weekly trust benchmark snapshots (Vercel Cron).
// GET /api/cron/trust-snapshots   (?force=1 — always runs anyway)
//
// For every trust, gathers its schools' classes via the service role (so it
// doesn't need a trust_lead session), aggregates each class's weak objectives
// from retrieval, rolls them up with the SAME shared function the live dashboard
// uses, and upserts one snapshot row per trust per day.
//
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, SK_API_KEY

import { rollupTrust, mapPool, type EnrichedClass } from "@/lib/trustBenchmark";
import { cronAuthorized, withTimeout, RETRIEVAL_TIMEOUT_MS } from "@/lib/serverHelpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  const secret = process.env.SK_API_KEY || "";
  if (!secret) return j({ error: "SK_API_KEY missing (needed for retrieval data)" }, 500);

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
    } catch (e: any) { console.warn(`trust-snapshots retRpc ${fn} failed: ${e?.message || e}`); return []; }
  };

  let trusts: any[];
  try { trusts = await admin("trusts?select=id,name"); } catch (e: any) { return j({ error: `load trusts: ${e.message}` }, 500); }

  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];

  for (const t of trusts || []) {
    try {
      const schools = await admin(`schools?trust_id=eq.${t.id}&select=id,name`);
      if (!schools?.length) { results.push({ trust: t.name, skipped: "no schools" }); continue; }
      const schoolName = new Map<string, string>(schools.map((s: any) => [s.id, s.name]));
      const schoolIds = schools.map((s: any) => s.id);

      const profiles = await admin(`profiles?school_id=in.(${schoolIds.join(",")})&select=id,school_id`);
      const schoolByTeacher = new Map<string, string>(profiles.map((p: any) => [p.id, p.school_id]));
      const teacherIds = profiles.map((p: any) => p.id);
      if (!teacherIds.length) { results.push({ trust: t.name, skipped: "no staff" }); continue; }

      const classes = await admin(`classes?teacher_id=in.(${teacherIds.join(",")})&archived=eq.false&select=id,teacher_id,year_group,retrieval_class_ids`);

      const enriched: EnrichedClass[] = await mapPool(classes || [], 8, async (c: any) => {
        const sid = schoolByTeacher.get(c.teacher_id) || "";
        const retId = (c.retrieval_class_ids || [])[0];
        let weak: any[] = [];
        if (retId) {
          const rows = await retRpc("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 });
          weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({ topic_id: w.topic_id, topic_name: w.topic_name, pct_correct: Math.round(Number(w.pct_correct)) }));
        }
        return { school_id: sid, school_name: schoolName.get(sid) || "School", year_group: c.year_group, linked: !!retId, weak };
      });

      const { schools: schoolRollup, cohort, trustAvg } = rollupTrust(enriched);

      // Upsert one row per trust per day.
      const r = await fetch(`${SK_URL}/rest/v1/trust_benchmark_snapshots?on_conflict=trust_id,taken_on`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ trust_id: t.id, taken_on: today, trust_avg: trustAvg, payload: { schools: schoolRollup, cohort } }),
      });
      if (!r.ok) throw new Error(`snapshot write: ${r.status}`);
      results.push({ trust: t.name, trustAvg, schools: schoolRollup.length, ok: true });
    } catch (e: any) {
      results.push({ trust: t.name, error: e.message });
    }
  }

  return j({ date: today, snapshotted: results.filter((r) => r.ok).length, results });
}
