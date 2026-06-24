"use client";
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { QuestionRunner, RunResult } from "@/components/driving/QuestionRunner";
import { buildMockTest, THEORY_TOTAL, THEORY_PASS_MARK, THEORY_TIME_SEC } from "@/lib/driving/mock";
import { recordTheoryAttempt } from "@/lib/driving/storage";

export default function TheoryPage() {
  const [started, setStarted] = useState(false);
  const [instant, setInstant] = useState(true);
  const [timed, setTimed] = useState(true);
  const [seed, setSeed] = useState(0);

  const questions = useMemo(() => buildMockTest(THEORY_TOTAL), [seed]);

  const onComplete = (r: RunResult) => {
    recordTheoryAttempt({ at: Date.now(), score: r.score, total: r.total, passed: r.passed, seconds: r.seconds });
  };

  if (started)
    return (
      <Shell>
        <TopBar active="/driving/theory" />
        <QuestionRunner
          key={seed}
          questions={questions}
          instantFeedback={instant}
          durationSec={timed ? THEORY_TIME_SEC : null}
          passMark={THEORY_PASS_MARK}
          title="Mock theory test"
          kicker="Mock theory test"
          onComplete={onComplete}
        />
      </Shell>
    );

  return (
    <Shell>
      <TopBar active="/driving/theory" />
      <PageTitle
        kicker="Multiple choice"
        title="Mock theory test"
        sub={
          <>
            A full {THEORY_TOTAL}-question mock that mirrors the real DVSA car theory test: {THEORY_TOTAL} questions,
            a {Math.round(THEORY_TIME_SEC / 60)}-minute limit and a pass mark of {THEORY_PASS_MARK}. Questions are
            drawn across all 14 official topics.
          </>
        }
      />

      <div style={{ ...card, padding: "24px 26px" }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
          <Stat label="Questions" value={String(THEORY_TOTAL)} />
          <Stat label="Pass mark" value={`${THEORY_PASS_MARK} / ${THEORY_TOTAL}`} />
          <Stat label="Time limit" value={`${Math.round(THEORY_TIME_SEC / 60)} min`} />
        </div>

        <ToggleRow
          label="Show the answer after each question"
          desc="Learn as you go — see the correct answer and an explanation the moment you answer. Turn off for a strict exam where answers appear only at the end."
          on={instant}
          set={setInstant}
        />
        <ToggleRow
          label="Use the exam timer"
          desc={`Count down from ${Math.round(THEORY_TIME_SEC / 60)} minutes, like the real test. The test ends automatically when time runs out.`}
          on={timed}
          set={setTimed}
        />

        <button
          onClick={() => { setSeed((s) => s + 1); setStarted(true); }}
          style={{
            marginTop: 12,
            padding: "13px 26px",
            borderRadius: 8,
            border: "none",
            background: C.accent,
            color: C.accentFg,
            fontFamily: C.mono,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Start mock test →
        </button>
      </div>

      <a href="/driving/casestudy" style={{ display: "inline-block", marginTop: 16, fontFamily: C.mono, fontSize: 13, color: C.blu, textDecoration: "none" }}>
        📋 Practise a case study (scenario + 5 questions) →
      </a>

      <p style={{ fontSize: 12, color: C.dim, marginTop: 14, lineHeight: 1.5 }}>
        Note: these are original revision questions written for this app based on The Highway Code — not the official
        DVSA question bank. They cover the same topics and rules so you can practise effectively.
      </p>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.serif, fontSize: 30, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, on, set }: { label: string; desc: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "14px 4px",
        borderBottom: `1px solid ${C.rule}`,
        background: "none",
        border: "none",
        borderTop: "none",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      aria-pressed={on}
    >
      <span
        style={{
          width: 42,
          height: 24,
          borderRadius: 99,
          background: on ? C.grn : C.border,
          position: "relative",
          flexShrink: 0,
          transition: "background .15s",
          marginTop: 2,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 20 : 2,
            width: 20,
            height: 20,
            borderRadius: 99,
            background: "#fff",
            transition: "left .15s",
          }}
        />
      </span>
      <span>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.text, display: "block" }}>{label}</span>
        <span style={{ fontSize: 13, color: C.muted, display: "block", marginTop: 3, lineHeight: 1.4 }}>{desc}</span>
      </span>
    </button>
  );
}
