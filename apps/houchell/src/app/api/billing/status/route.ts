// Houchell Education — billing status for the /billing page.
// GET /api/billing/status   Authorization: Bearer <JWT>
// Returns: { configured, plans, entitlement, usage }

import { stripeConfigured } from "@/lib/stripe";
import { getEntitlement } from "@/lib/entitlements";
import { costGBP } from "@/lib/aiBudget";
import { AI_MODELS } from "@/lib/serverHelpers";

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const num = (k: string) => Number(process.env[k]) || 0;

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  return r.ok ? r.json() : [];
}
async function rpc(fn: string, body: any, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);

  let uid = "";
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (u.ok) uid = (await u.json()).id;
  } catch { /* anon */ }

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [plans, entitlement, usageRows, orgRows] = await Promise.all([
    rest(`plans?select=slug,name,price_pence,interval,audience,features,stripe_price_id&order=sort_order.asc`, token),
    getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token }),
    uid ? rest(`daily_token_usage?teacher_id=eq.${uid}&day=eq.${today}&select=input_tokens,output_tokens`, token) : Promise.resolve([]),
    uid ? rpc("school_ai_spend", { p_since: monthStart }, token) : Promise.resolve([]),
  ]);

  // Priced at Opus rates (conservative — the pool mixes models but has no per-call record).
  const u = (usageRows && usageRows[0]) || { input_tokens: 0, output_tokens: 0 };
  const org = (orgRows && orgRows[0]) || null;
  const usage = {
    todayGBP: costGBP(u.input_tokens || 0, u.output_tokens || 0, AI_MODELS.OPUS),
    dailyCapGBP: num("AI_DAILY_CAP_GBP") || null,
    orgMonthGBP: org ? costGBP(org.input_tokens || 0, org.output_tokens || 0, AI_MODELS.OPUS) : null,
    orgMonthlyCapGBP: num("AI_ORG_MONTHLY_CAP_GBP") || null,
  };

  return j({ configured: stripeConfigured(), plans, entitlement, usage });
}
