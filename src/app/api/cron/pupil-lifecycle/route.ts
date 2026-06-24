// Feynman Education — pupil data lifecycle (Vercel Cron)
// GET /api/cron/pupil-lifecycle   (?force=1 has no special effect; it always runs)
//
// Runs the leaver-deletion lifecycle: purges MIS-roster data for pupils who have
// dropped off their school's latest successful sync and are past the retention
// window. All the logic + safety guards live in the SECURITY DEFINER RPC
// purge_left_pupils() (see 20260622_pupil_data_lifecycle.sql); this route just
// authorises the cron, invokes it with the service role, and records the run.
//
// Env (Vercel):
//   CRON_SECRET                 — shared secret (Authorization: Bearer <it>)
//   SUPABASE_SERVICE_ROLE_KEY   — service role (the RPC is not client-callable)
//   PUPIL_RETENTION_DAYS        — keep a leaver's data this long (default 365)
//   MIS_MAX_SYNC_AGE_DAYS       — only act on schools synced this recently (default 8)
import { cronAuthorized, recordCronRun, skAdmin, json } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "pupil-lifecycle";

export const runtime = "nodejs";
export const maxDuration = 120;

const num = (k: string, d: number) => Number(process.env[k]) || d;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);

  const startedAt = new Date().toISOString();
  const p_retention_days = num("PUPIL_RETENTION_DAYS", 365);
  const p_max_sync_age_days = num("MIS_MAX_SYNC_AGE_DAYS", 8);

  try {
    // Scalar-returning RPC → PostgREST returns the integer directly.
    const purged = await skAdmin("POST", "rpc/purge_left_pupils", { p_retention_days, p_max_sync_age_days });
    const count = typeof purged === "number" ? purged : Number(purged) || 0;
    await recordCronRun(JOB, { startedAt, ok: true, processed: count, failed: 0, notes: `purged ${count} left pupils (retention ${p_retention_days}d)` });
    return json({ ok: true, purged: count });
  } catch (e: any) {
    await reportError(e, { route: JOB });
    await recordCronRun(JOB, { startedAt, ok: false, processed: 0, failed: 0, notes: e?.message?.slice(0, 200) });
    return json({ error: e?.message || "purge failed" }, 500);
  }
}
