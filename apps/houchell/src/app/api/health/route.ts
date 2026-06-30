// Houchell Education — single "is everything running?" endpoint.
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
import { RETRIEVAL_ORIGIN } from "@/lib/interactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RET_APP_ORIGIN takes precedence (legacy override); otherwise the shared
// retrieval origin (NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN + literal fallback).
const RET_APP_ORIGIN = process.env.RET_APP_ORIGIN || RETRIEVAL_ORIGIN;

// The cron jobs we expect to leave a heartbeat in cron_runs.
const JOBS = [
  "school-snapshots",
  "trust-snapshots",
  "weekly-parent-report",
  "halfterm-feedforward",
  "mis-sync",
  "mis-writeback",
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
  const [db, retrievalApp, crons] = await Promise.all([checkDb(), checkRetrievalApp(), checkCrons()]);
  const ok = db.ok && retrievalApp.ok;
  return j(
    {
      ok,
      checkedAt: new Date().toISOString(),
      db,
      retrievalApp,
      crons: crons.jobs,
    },
    ok ? 200 : 503,
  );
}
