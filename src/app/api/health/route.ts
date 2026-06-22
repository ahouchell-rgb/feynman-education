// Feynman Education — single "is everything running?" endpoint.
// GET /api/health
//
// Checks, in parallel:
//   • DB reachable        — a cheap REST HEAD against Supabase (anon key).
//   • retrieval-app up     — a HEAD against RET_APP_ORIGIN with a short timeout.
//   • cron freshness       — the most-recent cron_runs row PER job + its age in
//                            hours, so a silently-stalled snapshot/report job is
//                            visible at a glance.
//
// No secrets in the output (status booleans + job names + ages only), so it can
// be polled by an uptime checker. It degrades gracefully: a failed sub-check is
// reported as { ok:false }, it never throws, and overall `ok` is the AND of the
// reachability checks (cron staleness is surfaced, not failed-on, since "no runs
// yet" is a valid cold-start state).

import { SK_URL, SK_ANON } from "@/lib/serverHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RET_APP_ORIGIN =
  process.env.RET_APP_ORIGIN || process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com";

// The cron jobs we expect to leave a heartbeat in cron_runs.
const JOBS = [
  "school-snapshots",
  "trust-snapshots",
  "weekly-parent-report",
  "halfterm-feedforward",
  "mis-sync",
  "mis-writeback",
  "pupil-lifecycle",
] as const;

const j = (o: any, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function withTimeout(p: (signal: AbortSignal) => Promise<Response>, ms: number): Promise<Response | null> {
  try { return await p(AbortSignal.timeout(ms)); } catch { return null; }
}

/** DB reachable: a cheap zero-row REST read (anon key, no data returned). */
async function checkDb(): Promise<{ ok: boolean; status?: number }> {
  const r = await withTimeout(
    (signal) => fetch(`${SK_URL}/rest/v1/cron_runs?select=id&limit=1`, {
      method: "GET",
      headers: { apikey: SK_ANON, Authorization: `Bearer ${SK_ANON}`, Prefer: "count=none" },
      signal,
    }),
    4000,
  );
  // RLS may make the row set empty, but any 2xx/4xx means the DB answered.
  return { ok: !!r && r.status < 500, status: r?.status };
}

/** Retrieval-app reachable: a HEAD against its origin (short timeout). */
async function checkRetrievalApp(): Promise<{ ok: boolean; origin: string; status?: number }> {
  const r = await withTimeout((signal) => fetch(RET_APP_ORIGIN, { method: "HEAD", signal }), 4000);
  return { ok: !!r && r.status < 500, origin: RET_APP_ORIGIN, status: r?.status };
}

// The retrieval-app-owned RPCs this app calls across the "two repos, one schema"
// boundary. If the retrieval side hasn't shipped one, every caller degrades
// silently to an empty list (parent reports / dashboards look "broken" with no
// error). This probe makes that drift VISIBLE: it calls each function with a
// throwaway id and classifies the response.
const RETRIEVAL_RPCS: Array<[string, Record<string, unknown>]> = [
  ["class_weak_topics", { p_class_id: "00000000-0000-0000-0000-000000000000", p_limit: 1, p_min_marked: 0 }],
  ["student_weak_topics", { p_student_id: "00000000-0000-0000-0000-000000000000", p_limit: 1 }],
  ["class_intervention_list", { p_class_id: "00000000-0000-0000-0000-000000000000", p_threshold: 50 }],
];

/** Probe each retrieval RPC: present / missing / gated / unknown. A 404
 *  (PostgREST PGRST202) means the function isn't deployed — real drift. A
 *  401/403 means it exists but is auth-gated (fine). Skipped if SK_API_KEY is
 *  unset (the gate secret), since we can't tell missing from gated without it. */
async function checkRetrievalRpcs(): Promise<{ ok: boolean; rpcs: Record<string, string> }> {
  const secret = process.env.SK_API_KEY;
  const out: Record<string, string> = {};
  if (!secret) {
    for (const [fn] of RETRIEVAL_RPCS) out[fn] = "skipped";
    return { ok: true, rpcs: out };
  }
  await Promise.all(RETRIEVAL_RPCS.map(async ([fn, body]) => {
    const r = await withTimeout((signal) => fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${SK_ANON}`, "x-sciencekit-key": secret },
      body: JSON.stringify(body),
    }), 4000);
    out[fn] = !r ? "unknown" : r.status === 404 ? "missing" : r.status < 300 ? "present" : (r.status === 401 || r.status === 403) ? "gated" : "unknown";
  }));
  return { ok: !Object.values(out).includes("missing"), rpcs: out };
}

/** Most-recent cron_runs row per job (service role, so RLS doesn't hide it). */
async function checkCrons(): Promise<{ ok: boolean; jobs: Record<string, any> }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out: Record<string, any> = {};
  for (const job of JOBS) out[job] = { lastRun: null, ageHours: null, ok: null };
  if (!key) return { ok: false, jobs: out };
  try {
    const rows: any[] = await fetch(
      `${SK_URL}/rest/v1/cron_runs?select=job,finished_at,ok,processed,failed,notes&order=finished_at.desc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    ).then((r) => (r.ok ? r.json() : []));
    const now = Date.now();
    for (const row of rows || []) {
      if (out[row.job]?.lastRun) continue; // first (newest) per job wins
      if (!(row.job in out)) out[row.job] = {};
      const t = Date.parse(row.finished_at);
      out[row.job] = {
        lastRun: row.finished_at,
        ageHours: isNaN(t) ? null : Math.round(((now - t) / 36e5) * 10) / 10,
        ok: row.ok,
        processed: row.processed,
        failed: row.failed,
        notes: row.notes,
      };
    }
    return { ok: true, jobs: out };
  } catch {
    return { ok: false, jobs: out };
  }
}

export async function GET() {
  const [db, retrievalApp, retrievalRpcs, crons] = await Promise.all([
    checkDb(), checkRetrievalApp(), checkRetrievalRpcs(), checkCrons(),
  ]);
  // A missing retrieval RPC is a real, otherwise-silent failure, so it fails the
  // overall check alongside basic reachability.
  const ok = db.ok && retrievalApp.ok && retrievalRpcs.ok;
  return j(
    {
      ok,
      checkedAt: new Date().toISOString(),
      db,
      retrievalApp,
      retrievalRpcs: retrievalRpcs.rpcs,
      crons: crons.jobs,
    },
    ok ? 200 : 503,
  );
}
