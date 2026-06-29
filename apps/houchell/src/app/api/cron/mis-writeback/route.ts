// Feynman Education — MIS write-back worker (Vercel Cron).
// GET /api/cron/mis-writeback
// Drains every active connection's pending write-back queue. Env-gated.
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, WONDE_TOKEN

import { wondeConfigured, runWriteback } from "@/lib/wonde";
import { cronAuthorized, recordCronRun } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "mis-writeback";

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  const startedAt = new Date().toISOString();
  if (!wondeConfigured()) {
    await recordCronRun(JOB, { startedAt, ok: true, processed: 0, failed: 0, notes: "MIS not configured" });
    return j({ skipped: "MIS not configured" });
  }

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
    const res = await runWriteback(c.school_id, c.mis_school_id);
    results.push({ school_id: c.school_id, ...res });
  }
  const sent = results.reduce((a, r) => a + (r.sent || 0), 0);
  const failed = results.reduce((a, r) => a + (r.failed || 0), 0);
  await recordCronRun(JOB, { startedAt, ok: failed === 0, processed: sent, failed, notes: `${sent} written back, ${failed} failed across ${results.length} connections` });
  return j({ results });
}
