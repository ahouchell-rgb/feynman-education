// Feynman Education — entitlements (server-only).
// Resolves what a user can do from their active subscription's plan features.
// Defaults to the free plan. Used to gate Pro AI features behind billing.

import { supaRest } from "@/lib/supabaseRest";

export interface Entitlement {
  plan: string;
  status: string;
  active: boolean;
  features: Record<string, any>;
}

const FREE: Entitlement = { plan: "free", status: "inactive", active: false, features: {} };

/** Load the caller's entitlement (subscription + that plan's features) under RLS. */
export async function getEntitlement(opts: { skUrl: string; apikey: string; bearer: string }): Promise<Entitlement> {
  try {
    const sub = await supaRest(opts.skUrl, "subscriptions", {
      apikey: opts.apikey, bearer: opts.bearer,
      params: { select: "plan_slug,status", limit: "1" },
    });
    const row = Array.isArray(sub) ? sub[0] : sub;
    const active = row && (row.status === "active" || row.status === "trialing");
    if (!active || !row.plan_slug) return FREE;
    const plans = await supaRest(opts.skUrl, "plans", {
      apikey: opts.apikey, bearer: opts.bearer,
      params: { slug: `eq.${row.plan_slug}`, select: "slug,features", limit: "1" },
    });
    const plan = Array.isArray(plans) ? plans[0] : plans;
    return { plan: row.plan_slug, status: row.status, active: true, features: plan?.features || {} };
  } catch {
    return FREE;
  }
}

export function can(ent: Entitlement, feature: string): boolean {
  return !!ent.features?.[feature];
}
