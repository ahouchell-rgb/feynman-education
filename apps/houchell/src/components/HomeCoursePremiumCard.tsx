"use client";
import { useState } from "react";

// Parent-facing D2C upgrade surface for the Springboard home-learning course —
// the "volume cash engine" wedge from docs/SECONDARY_ED_STRATEGY.md.
//
// SCOPE: this is the SURFACE + the CTA seam only. It does NOT take payment,
// create Stripe prices, or call any live billing endpoint. The CTA routes to a
// local "interest captured" state; the real checkout attaches at the clearly
// marked TODO seam in `startHomeCourseCheckout` once a price is decided.
//
// The card is gated by `hasHomeCoursePremium(...)` (lib/entitlements): premium
// parents don't see the upsell, free parents (the default for everyone) do.

// Match the parent portal's design tokens (src/app/parent/page.tsx COL).
const COL = {
  card: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)",
  text: "#f5f7fb", muted: "#9aa8bc", dim: "#7d8aa0", gold: "#ffd166", green: "#58e0c2",
};

const BENEFITS: Array<{ icon: string; label: string }> = [
  { icon: "📈", label: "Richer progress insights — see exactly where each topic is sticking" },
  { icon: "🔓", label: "Every unit unlocked across the whole KS3 course" },
  { icon: "✉️", label: "A weekly email report summarising practice and next steps" },
  { icon: "🎯", label: "Personalised target tracking toward a goal grade" },
];

/**
 * Checkout entry point for the home-learning premium tier.
 *
 * STUB — intentionally does NOT charge or create a Stripe price. The pricing and
 * Stripe product are the owner's decision (see docs/SECONDARY_ED_STRATEGY.md).
 *
 * TODO: attach Stripe checkout once price is decided. When ready:
 *   1. Create a recurring price in Stripe and store its id (e.g. env
 *      STRIPE_PRICE_HOME_COURSE_PREMIUM).
 *   2. Add an API route (e.g. POST /api/parent/home-course/checkout) that calls
 *      createCheckoutSession({ priceId, ... }) from src/lib/stripe.ts with the
 *      guardian's token/identity and success/cancel URLs back to /parent.
 *   3. Replace the body below with a fetch to that route and
 *      `window.location.href = url` to the returned hosted-checkout page.
 * Until then this only flips the local "interest captured" state — no network
 * call, no charge.
 */
function startHomeCourseCheckout(_token: string): { ok: true; mode: "interest" } {
  // TODO: attach Stripe checkout once price is decided (see JSDoc above).
  return { ok: true, mode: "interest" };
}

export function HomeCoursePremiumCard({ token }: { token: string }) {
  const [interested, setInterested] = useState(false);

  const onUpgrade = () => {
    const r = startHomeCourseCheckout(token);
    if (r.ok) setInterested(true); // placeholder: capture interest, no charge
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(255,209,102,0.10), rgba(255,255,255,0.05))",
      border: `1px solid rgba(255,209,102,0.30)`, borderRadius: 12, padding: 22, marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COL.gold }}>Premium</span>
        <span style={{ fontSize: 11, color: COL.dim, border: `1px solid ${COL.border}`, borderRadius: 999, padding: "1px 8px" }}>
          Home science course
        </span>
      </div>

      <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>Unlock the full home-learning course</h2>
      <p style={{ fontSize: 14, color: COL.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
        Keep the free course — and add the extras that help most: deeper insight into how your child is
        doing, every unit opened up, and a short weekly report so you always know what to practise next.
      </p>

      <div style={{ marginBottom: 18 }}>
        {BENEFITS.map((b) => (
          <div key={b.label} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0" }}>
            <span style={{ fontSize: 16, lineHeight: "20px" }}>{b.icon}</span>
            <span style={{ fontSize: 13.5, color: COL.text, lineHeight: 1.45 }}>{b.label}</span>
          </div>
        ))}
      </div>

      {interested ? (
        <div style={{
          background: "rgba(88,224,194,0.10)", border: `1px solid rgba(88,224,194,0.25)`,
          borderRadius: 10, padding: "12px 16px", fontSize: 13.5, color: COL.text,
        }}>
          <strong style={{ color: COL.green }}>Thanks — you're on the list.</strong>{" "}
          Premium isn't open for sign-up just yet. We'll email you the moment it goes live so you can be
          first in. In the meantime, the free course stays fully available.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button onClick={onUpgrade} style={{
            background: COL.gold, color: "#241a00", padding: "11px 22px", borderRadius: 8,
            border: "none", fontWeight: 700, fontSize: 14.5, cursor: "pointer",
          }}>
            Upgrade to Premium
          </button>
          <span style={{ fontSize: 12, color: COL.dim }}>
            No charge yet — register your interest and we'll let you know when it launches.
          </span>
        </div>
      )}
    </div>
  );
}
