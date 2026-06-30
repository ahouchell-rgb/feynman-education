// Houchell Education — entitlements (server-only).
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

// ---------------------------------------------------------------------------
// Home-learning course (Springboard) — parent D2C premium tier.
//
// The parent portal is password-less (magic-link token), so it never carries a
// server-resolved `Entitlement`. This helper mirrors the `can()` convention but
// reads the premium flag straight off the portal payload, so the gate lives in
// one place and DEFAULTS TO FREE: if nothing in the payload proves premium, the
// parent sees the free tier and the upgrade surface stays visible. Flipping a
// child to premium is a pure data change (no UI change needed) once the billing
// seam below is wired.
//
// Feature key on a paid plan's `features` map; also the per-link/portal flag the
// premium tier sets once a parent subscribes.
export const HOME_COURSE_PREMIUM_FEATURE = "home_course_premium";

/** Minimal shape this gate needs from the parent-portal payload. Kept loose so
 *  the portal page can pass its own `Child[]` without a type dependency. */
export interface HomeCoursePremiumInput {
  // Optional server-resolved entitlement (teacher-side callers may have one).
  entitlement?: Entitlement | null;
  // Parent-portal children; premium is true if ANY linked child is flagged.
  children?: Array<{ home?: { premium?: boolean } | null } | null> | null;
}

/** True only when the caller has the paid home-learning tier. Everyone else —
 *  including every current user — gets `false` (the free tier). */
export function hasHomeCoursePremium(input: HomeCoursePremiumInput | null | undefined): boolean {
  if (!input) return false;
  if (input.entitlement && input.entitlement.active && can(input.entitlement, HOME_COURSE_PREMIUM_FEATURE)) {
    return true;
  }
  if (Array.isArray(input.children)) {
    return input.children.some((c) => !!c?.home?.premium);
  }
  return false;
}
