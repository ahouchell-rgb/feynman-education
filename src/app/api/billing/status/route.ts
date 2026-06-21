// Feynman Education — billing status for the /billing page.
// GET /api/billing/status   Authorization: Bearer <JWT>
// Returns: { configured, plans, entitlement, usage }

import { stripeConfigured } from "@/lib/stripe";
import { getEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// AI spend governance: surface today's token spend (the shared daily pool).
const INPUT_GBP = 5 * 0.79 / 1e6, OUTPUT_GBP = 25 * 0.79 / 1e6; // priced at Opus rates (conservative)

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
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
  const [plans, entitlement, usageRows] = await Promise.all([
    rest(`plans?select=slug,name,price_pence,interval,audience,features,stripe_price_id&order=sort_order.asc`, token),
    getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token }),
    uid ? rest(`daily_token_usage?teacher_id=eq.${uid}&day=eq.${today}&select=input_tokens,output_tokens`, token) : Promise.resolve([]),
  ]);

  const u = (usageRows && usageRows[0]) || { input_tokens: 0, output_tokens: 0 };
  const usage = { todayGBP: (u.input_tokens || 0) * INPUT_GBP + (u.output_tokens || 0) * OUTPUT_GBP };

  return j({ configured: stripeConfigured(), plans, entitlement, usage });
}
