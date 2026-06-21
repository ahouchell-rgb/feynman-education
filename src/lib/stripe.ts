// Feynman Education — Stripe (server-only, env-gated, no SDK).
//
// Talks to the Stripe REST API with plain fetch. Without STRIPE_SECRET_KEY the
// helpers report "not configured" and the billing UI disables checkout — same
// pattern as lib/email and lib/wonde. Webhook signatures are verified with the
// node crypto HMAC so the subscription writes can be trusted.
//   STRIPE_SECRET_KEY      — sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET  — whsec_…  (for /api/billing/webhook)

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

async function stripePost(path: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`${STRIPE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Stripe ${r.status}`);
  return d;
}

/** A subscription Checkout session. Returns the hosted-page URL to redirect to. */
export async function createCheckoutSession(opts: {
  priceId: string; userId: string; email?: string; successUrl: string; cancelUrl: string;
}): Promise<{ url: string }> {
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    "metadata[user_id]": opts.userId,
    "subscription_data[metadata][user_id]": opts.userId,
    allow_promotion_codes: "true",
  };
  if (opts.email) params.customer_email = opts.email;
  const s = await stripePost("checkout/sessions", params);
  return { url: s.url };
}

/** A Billing Portal session so a customer can manage/cancel their subscription. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const s = await stripePost("billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return { url: s.url };
}

/** Verify a Stripe webhook signature (t + v1 HMAC-SHA256 over `${t}.${body}`). */
export function verifyWebhook(rawBody: string, sigHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    const a = Buffer.from(expected), b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
