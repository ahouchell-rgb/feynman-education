// Houchell Education — nightly MIS sync (Vercel Cron).
// GET /api/cron/mis-sync   (?force=1 to bypass nothing; it always runs)
//
// Iterates every active mis_connection and runs a Wonde sync. Env-gated.
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, WONDE_TOKEN, WONDE_SCHOOL_ID

import { wondeConfigured, runMisSync } from "@/lib/wonde";
import { cronAuthorized, recordCronRun, SK_URL } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "mis-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  const startedAt = new Date().toISOString();
  if (!wondeConfigured()) {
    await recordCronRun(JOB, { startedAt, ok: true, processed: 0, failed: 0, notes: "MIS not configured" });
    return j({ skipped: "MIS not configured" });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let conns: any[] = [];
  try {
    const r = await fetch(`${SK_URL}/rest/v1/mis_connections?status=in.(pending,active)&select=school_id,mis_school_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    conns = await r.json();
  } catch (e: any) {
    await reportError(e, { route: JOB, phase: "load connections" });
    await recordCronRun(JOB, { startedAt, ok: false, processed: 0, failed: 0, notes: `load connections: ${e.message}` });
    return j({ error: `load connections: ${e.message}` }, 500);
  }

  const results: any[] = [];
  for (const c of conns || []) {
    const res = await runMisSync(c.school_id, c.mis_school_id, "full");
    if (!res?.ok) await reportError(new Error(res?.error || "mis sync failed"), { route: JOB, school_id: c.school_id });
    results.push({ school_id: c.school_id, ...res });
  }
  const processed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  await recordCronRun(JOB, { startedAt, ok: failed === 0, processed, failed, notes: `${processed} synced, ${failed} failed of ${results.length} connections` });
  return j({ synced: processed, results });
}
