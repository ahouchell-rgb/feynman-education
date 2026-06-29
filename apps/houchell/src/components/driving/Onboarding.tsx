"use client";
import { useEffect, useState } from "react";
import { Cd as C } from "@/lib/driving/theme";

const KEY = "uk-driving-onboarded-v1";

const STEPS = [
  { icon: "🚗", title: "Pass your UK theory test", body: "Everything for both parts of the real test — multiple choice and hazard perception — in one place, with answers explained as you go." },
  { icon: "📖", title: "Learn, then test yourself", body: "Start with bite-size lessons, then take full mock tests. The app shows the correct answer and why after every question." },
  { icon: "🚦", title: "Train your hazard perception", body: "Drive through realistic clips and click hazards as they develop — scored just like the real DVSA test." },
  { icon: "✦", title: "It learns what you need", body: "Smart practice targets your weak topics and past mistakes, and a readiness score tells you when you're ready to book." },
];

export function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch {}
  }, []);

  if (!show) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(4,6,12,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "30px 28px", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>{s.icon}</div>
        <h2 style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 26, lineHeight: 1.15, marginBottom: 10, color: C.text }}>{s.title}</h2>
        <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.55 }}>{s.body}</p>

        <div style={{ display: "flex", justifyContent: "center", gap: 7, margin: "22px 0" }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 99, background: i === step ? C.grn : C.border, transition: "all .2s" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={close} style={{ flex: "0 0 auto", padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 13, cursor: "pointer" }}>
            Skip
          </button>
          <button
            onClick={() => (last ? close() : setStep((v) => v + 1))}
            style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: C.accent, color: C.accentFg, fontFamily: C.mono, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {last ? "Get started →" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
