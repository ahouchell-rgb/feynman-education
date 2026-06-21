// Feynman Education — start a Stripe Checkout (or Billing Portal) session.
// POST /api/billing/checkout   Authorization: Bearer <JWT>
// Body: { plan }            → returns { url } to redirect to checkout
//   or  { portal: true }    → returns { url } to the billing portal (manage/cancel)

import { stripeConfigured, createCheckoutSession, createPortalSession } from "@/lib/stripe";

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  return r.ok ? r.json() : [];
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  if (!stripeConfigured()) return j({ error: "Billing isn't configured yet (STRIPE_SECRET_KEY)." }, 400);

  let body: any; try { body = await req.json(); } catch { body = {}; }
  const origin = APP_ORIGIN || new URL(req.url).origin;

  // Resolve caller.
  let user: any;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    user = await u.json();
  } catch { return j({ error: "Auth check failed" }, 401); }

  // Portal mode — needs an existing Stripe customer.
  if (body?.portal) {
    const sub = (await rest(`subscriptions?select=stripe_customer_id&limit=1`, token))?.[0];
    if (!sub?.stripe_customer_id) return j({ error: "No billing account yet — subscribe first." }, 400);
    try { return j(await createPortalSession(sub.stripe_customer_id, `${origin}/billing`)); }
    catch (e: any) { return j({ error: e.message }, 502); }
  }

  // Checkout mode.
  const planSlug = String(body?.plan || "");
  if (!planSlug) return j({ error: "plan is required" }, 400);
  const plan = (await rest(`plans?slug=eq.${planSlug}&select=stripe_price_id,name`, token))?.[0];
  if (!plan?.stripe_price_id) return j({ error: `Plan "${planSlug}" has no Stripe price configured.` }, 400);

  try {
    const { url } = await createCheckoutSession({
      priceId: plan.stripe_price_id, userId: user.id, email: user.email,
      successUrl: `${origin}/billing?status=success`, cancelUrl: `${origin}/billing?status=cancelled`,
    });
    return j({ url });
  } catch (e: any) { return j({ error: e.message }, 502); }
}
