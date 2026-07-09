"use client";
import { useEffect, useState } from "react";

// Parent-facing D2C upgrade surface for the Springboard home-learning course —
// the "volume cash engine" wedge from docs/SECONDARY_ED_STRATEGY.md.
//
// SCOPE: this is the SURFACE + real interest capture. It does NOT take payment
// or create Stripe prices — pricing is the owner's decision (see
// docs/SECONDARY_ED_STRATEGY.md). The CTA registers the guardian's interest
// server-side (POST /api/parent/home-course/interest → home_course_interest),
// so the "we'll email you" promise is backed by an actual list.
//
// TODO: attach Stripe checkout once a price is decided. When ready:
//   1. Create a recurring price in Stripe and store its id (e.g. env
//      STRIPE_PRICE_HOME_COURSE_PREMIUM).
//   2. Add an API route (e.g. POST /api/parent/home-course/checkout) that calls
//      createCheckoutSession({ priceId, ... }) from src/lib/stripe.ts with the
//      guardian's token/identity and success/cancel URLs back to /parent.
//   3. Swap the register-interest CTA for a fetch to that route and
//      `window.location.href = url` to the returned hosted-checkout page.
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

// The token is already the URL path the parent is on, so keying localStorage by
// it adds no exposure beyond what the browser history holds.
const LS_KEY = (token: string) => `hc_premium_interest:${token}`;

export function HomeCoursePremiumCard({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  // Survive a refresh: if this browser already registered, keep showing it.
  useEffect(() => {
    try { if (localStorage.getItem(LS_KEY(token))) setState("done"); } catch {}
  }, [token]);

  const onRegister = async () => {
    setState("sending");
    try {
      const r = await fetch("/api/parent/home-course/interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      if (!r.ok) throw new Error(String(r.status));
      try { localStorage.setItem(LS_KEY(token), "1"); } catch {}
      setState("done");
    } catch {
      setState("error");
    }
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

      <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>The full home-learning course is coming</h2>
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

      {state === "done" ? (
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
          <button onClick={onRegister} disabled={state === "sending"} style={{
            background: COL.gold, color: "#241a00", padding: "11px 22px", borderRadius: 8,
            border: "none", fontWeight: 700, fontSize: 14.5,
            cursor: state === "sending" ? "wait" : "pointer",
            opacity: state === "sending" ? 0.7 : 1,
          }}>
            {state === "sending" ? "Registering…" : "Register interest"}
          </button>
          <span style={{ fontSize: 12, color: COL.dim }}>
            {state === "error"
              ? "Something went wrong — please try again."
              : "No charge — we'll email you when Premium launches."}
          </span>
        </div>
      )}
    </div>
  );
}
