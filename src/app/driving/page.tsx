"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { C } from "@/lib/theme";
import { Shell, TopBar, card } from "@/components/driving/ui";
import { loadProgress, resetProgress, Progress } from "@/lib/driving/storage";
import { QUESTIONS } from "@/lib/driving/questions";
import { THEORY_PASS_MARK, THEORY_TOTAL } from "@/lib/driving/mock";

export default function DrivingHome() {
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => setP(loadProgress()), []);

  const answered = p ? Object.values(p.questions).reduce((a, q) => a + q.seen, 0) : 0;
  const correct = p ? Object.values(p.questions).reduce((a, q) => a + q.correct, 0) : 0;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const bestTheory = p?.theoryAttempts.reduce((m, a) => Math.max(m, a.score), 0) ?? 0;
  const bestHazard = p?.hazardAttempts.reduce((m, a) => Math.max(m, a.score), 0) ?? 0;
  const passedTheory = p?.theoryAttempts.some((a) => a.passed) ?? false;
  const passedHazard = p?.hazardAttempts.some((a) => a.passed) ?? false;

  return (
    <Shell>
      <TopBar active="/driving" />

      <div style={{ padding: "10px 0 30px" }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>
          UK car theory + hazard perception
        </div>
        <h1 style={{ fontFamily: C.serif, fontSize: 50, lineHeight: 1.02, fontWeight: 400, maxWidth: 640 }}>
          Pass your UK driving theory test.
        </h1>
        <p style={{ fontSize: 16, color: C.muted, marginTop: 14, maxWidth: 600, lineHeight: 1.55 }}>
          A complete trainer for both parts of the real test — the {THEORY_TOTAL}-question multiple choice and the
          hazard perception — with the correct answer and a clear explanation shown after every question, plus a full
          revision library to go over the content as often as you like.
        </p>
      </div>

      {/* main actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <BigCard
          href="/driving/learn"
          emoji="📖"
          title="Learn"
          desc="Short lessons on each topic, finishing with a few questions to check you've got it. Start here."
          accent={C.grn}
        />
        <BigCard
          href="/driving/theory"
          emoji="📝"
          title="Mock theory test"
          desc={`Full ${THEORY_TOTAL}-question timed mock. Pass mark ${THEORY_PASS_MARK}. Answers shown as you go.`}
          accent={C.blu}
          badge={passedTheory ? "Passed ✓" : bestTheory ? `Best ${bestTheory}/${THEORY_TOTAL}` : undefined}
        />
        <BigCard
          href="/driving/hazard"
          emoji="🚦"
          title="Hazard perception"
          desc="Driving perception clips. Click as each hazard develops, scored just like the real test."
          accent={C.red}
          badge={passedHazard ? "Passed ✓" : bestHazard ? `Best ${bestHazard}` : undefined}
        />
        <BigCard
          href="/driving/practice"
          emoji="🎯"
          title="Practice by topic"
          desc="Untimed practice, one topic at a time, with instant feedback. Great for weak areas."
          accent={C.grn}
        />
        <BigCard
          href="/driving/revise"
          emoji="📚"
          title="Revise"
          desc="Key facts, every road sign, and flashcards. Go over the content again and again."
          accent={C.amb}
        />
      </div>

      {/* progress */}
      <h2 style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, margin: "34px 0 14px" }}>
        Your progress
      </h2>
      <div style={{ ...card, padding: "22px 24px", display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center" }}>
        <Metric value={String(answered)} label="Questions answered" />
        <Metric value={`${accuracy}%`} label="Accuracy" />
        <Metric value={`${QUESTIONS.length}`} label="Questions in bank" />
        <Metric value={String((p?.theoryAttempts.length ?? 0) + (p?.hazardAttempts.length ?? 0))} label="Tests taken" />
        <Metric value={String(p?.flagged.length ?? 0)} label="Flagged to revise" />
        {answered > 0 && (
          <button
            onClick={() => { if (confirm("Reset all your driving progress on this device?")) setP(resetProgress()); }}
            style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 12, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer" }}
          >
            Reset progress
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: C.dim, marginTop: 24, lineHeight: 1.5, maxWidth: 640 }}>
        Original revision material based on The Highway Code (2026), built to mirror the structure and scoring of the
        DVSA car theory test. It is a study aid and is not affiliated with the DVSA. Your progress is stored only on
        this device.
      </p>
    </Shell>
  );
}

function BigCard({ href, emoji, title, desc, accent, badge }: { href: string; emoji: string; title: string; desc: string; accent: string; badge?: string }) {
  return (
    <Link
      href={href}
      style={{ ...card, padding: "22px 22px 20px", textDecoration: "none", color: C.text, position: "relative", overflow: "hidden", display: "block", transition: "transform .12s, border-color .12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "none"; }}
    >
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ fontSize: 30, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontFamily: C.serif, fontSize: 24, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{desc}</div>
      {badge && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: accent, marginTop: 12, fontWeight: 600 }}>{badge}</div>
      )}
    </Link>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.serif, fontSize: 34, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginTop: 5 }}>{label}</div>
    </div>
  );
}
