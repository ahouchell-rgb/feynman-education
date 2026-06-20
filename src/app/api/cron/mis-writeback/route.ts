// Feynman Education — MIS write-back worker (Vercel Cron).
// GET /api/cron/mis-writeback
// Drains every active connection's pending write-back queue. Env-gated.
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, WONDE_TOKEN

import { wondeConfigured, runWriteback } from "@/lib/wonde";

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function GET(req: Request) {
  const authed = req.headers.get("x-vercel-cron") != null ||
    (process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`);
  if (!authed) return j({ error: "unauthorized" }, 401);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  if (!wondeConfigured()) return j({ skipped: "MIS not configured" });

  let conns: any[] = [];
  try {
    const r = await fetch(`${SK_URL}/rest/v1/mis_connections?status=in.(pending,active)&select=school_id,mis_school_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    conns = await r.json();
  } catch (e: any) { return j({ error: `load connections: ${e.message}` }, 500); }

  const results: any[] = [];
  for (const c of conns || []) {
    const res = await runWriteback(c.school_id, c.mis_school_id);
    results.push({ school_id: c.school_id, ...res });
  }
  return j({ results });
}
