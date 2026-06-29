"use client";
import { useEffect, useState } from "react";
import { Cd as C } from "@/lib/driving/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { isPremium, startTrial, setPremium } from "@/lib/driving/premium";

const BENEFITS = [
  ["Unlimited mock tests", "Full 50-question mocks, as many as you like, freshly shuffled every time."],
  ["Full hazard perception", "All 14 driving clips with rain, fog and night, plus difficulty modes."],
  ["Every case study", "Practise DVSA-style scenario questions until they're second nature."],
  ["Smart adaptive practice", "The app targets your weak topics and the questions you get wrong."],
  ["Readiness tracking", "Know exactly when you're ready to book — and pass first time."],
  ["Ad-free, forever updates", "Clean, focused study. Kept current with The Highway Code."],
];

export default function PremiumPage() {
  const [premium, setP] = useState(false);
  useEffect(() => setP(isPremium()), []);

  return (
    <Shell>
      <TopBar active="/driving/premium" />
      <PageTitle
        kicker="Go Premium"
        title={premium ? "You're Premium ✓" : "Pass first time with Premium"}
        sub={premium ? "Thanks for supporting the app — everything is unlocked. Good luck on your test!" : "Everything you need to pass the UK theory test in one place. Try it free, then one simple payment — no subscription traps."}
      />

      {!premium && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
          <PlanCard
            highlight
            name="Premium"
            price="£4.99"
            note="one-off · lifetime access"
            cta="Start 3-day free trial"
            onClick={() => { startTrial(); setP(isPremium()); }}
          />
          <PlanCard name="Free" price="£0" note="get started" cta="Keep the free version" sub onClick={() => history.back()} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {BENEFITS.map(([h, d]) => (
          <div key={h} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ color: C.grn, fontSize: 18, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{h}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>{d}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: C.dim, marginTop: 22, lineHeight: 1.5 }}>
        Note: this is a demo of the purchase experience — the trial unlocks Premium on this device only. Real payments and
        cross-device access are wired through Stripe and an account once set up.
        {premium && (
          <>
            {" "}
            <button onClick={() => { setPremium(false); setP(false); }} style={{ background: "none", border: "none", color: C.blu, cursor: "pointer", fontFamily: C.mono, fontSize: 12 }}>
              (turn off Premium)
            </button>
          </>
        )}
      </p>
    </Shell>
  );
}

function PlanCard({ name, price, note, cta, onClick, highlight, sub }: { name: string; price: string; note: string; cta: string; onClick: () => void; highlight?: boolean; sub?: boolean }) {
  return (
    <div style={{ ...card, padding: "22px 22px", border: `1.5px solid ${highlight ? C.amb : C.border}`, position: "relative", overflow: "hidden" }}>
      {highlight && <span style={{ position: "absolute", top: 0, right: 0, background: C.amb, color: "#1b1405", fontFamily: C.mono, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderBottomLeftRadius: 8, letterSpacing: "0.08em" }}>BEST VALUE</span>}
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: highlight ? C.amb : C.dim }}>{name}</div>
      <div style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 700, margin: "6px 0 2px" }}>{price}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{note}</div>
      <button
        onClick={onClick}
        style={{ width: "100%", padding: "12px", borderRadius: 10, border: sub ? `1px solid ${C.border}` : "none", background: sub ? "transparent" : C.amb, color: sub ? C.muted : "#1b1405", fontFamily: C.mono, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        {cta}
      </button>
    </div>
  );
}
