// Feynman Education — Stripe webhook. POST /api/billing/webhook
// Verifies the signature, then upserts the user's subscription (service role).
// Handles checkout.session.completed + customer.subscription.{updated,deleted}.

import { verifyWebhook } from "@/lib/stripe";
import { SK_URL as SK_URL_SHARED } from "@/lib/serverHelpers";

export const runtime = "nodejs";

const SK_URL = SK_URL_SHARED;
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// Idempotency guard: claim this event id (service role). Returns true if WE
// claimed it (first delivery → process), false if it already existed (a Stripe
// retry → skip). Race-safe via the primary key: with Prefer:resolution=ignore-
// duplicates a duplicate INSERT yields an empty body, so an empty representation
// means "already processed". On any transport error we fail OPEN (return true)
// so a transient DB blip doesn't drop a real event — at-most-once is best-effort,
// correctness still comes from the upsert being idempotent on owner_id.
async function claimEvent(eventId: string): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const r = await fetch(`${SK_URL}/rest/v1/stripe_webhook_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ event_id: eventId }),
    });
    if (!r.ok) return true; // can't dedupe → process rather than silently drop
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0; // inserted a row → first time
  } catch { return true; }
}

async function upsertSub(row: any) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await fetch(`${SK_URL}/rest/v1/subscriptions?on_conflict=owner_id`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

// Map a Stripe price id back to our plan slug.
async function planForPrice(priceId: string): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/plans?stripe_price_id=eq.${priceId}&select=slug&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const d = await r.json().catch(() => []);
  return d?.[0]?.slug || null;
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "not configured" }, 500);
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) return j({ error: "bad signature" }, 400);

  let event: any; try { event = JSON.parse(raw); } catch { return j({ error: "bad body" }, 400); }

  // Dedupe: Stripe retries deliver the same event id; process each at most once.
  if (event?.id && !(await claimEvent(event.id))) return j({ received: true, deduped: true });

  const obj = event?.data?.object || {};
  const userId = obj?.metadata?.user_id || obj?.client_reference_id || null;

  try {
    if (event.type === "checkout.session.completed" && userId) {
      await upsertSub({ owner_id: userId, status: "active", stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription });
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      if (userId) {
        const priceId = obj?.items?.data?.[0]?.price?.id;
        await upsertSub({
          owner_id: userId,
          plan_slug: priceId ? await planForPrice(priceId) : undefined,
          status: obj.status,
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.id,
          current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
        });
      }
    } else if (event.type === "customer.subscription.deleted" && userId) {
      await upsertSub({ owner_id: userId, status: "canceled" });
    }
  } catch (e: any) {
    return j({ error: e.message }, 500);
  }
  return j({ received: true });
}
