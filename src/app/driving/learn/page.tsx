"use client";
import { useEffect, useMemo, useState } from "react";
import { Cd as C } from "@/lib/driving/theme";
import { Shell, TopBar, PageTitle, ProgressBar, card } from "@/components/driving/ui";
import { QuestionRunner } from "@/components/driving/QuestionRunner";
import { LESSONS, Lesson } from "@/lib/driving/lessons";
import { QUESTIONS_BY_CATEGORY } from "@/lib/driving/questions";
import { shuffle } from "@/lib/driving/mock";
import { loadProgress, markLessonDone } from "@/lib/driving/storage";

type Mode = "index" | "read" | "quiz";

export default function LearnPage() {
  const [mode, setMode] = useState<Mode>("index");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);

  useEffect(() => setDone(loadProgress().lessonsDone), [mode]);

  const quiz = useMemo(() => {
    if (!lesson) return [];
    return shuffle(QUESTIONS_BY_CATEGORY[lesson.category] ?? []).slice(0, lesson.quizCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, seed]);

  const open = (l: Lesson) => { setLesson(l); setStep(0); setMode("read"); };

  /* ── quiz ── */
  if (mode === "quiz" && lesson)
    return (
      <Shell>
        <TopBar active="/driving/learn" />
        <QuestionRunner
          key={lesson.id + seed}
          questions={quiz}
          instantFeedback
          durationSec={null}
          passMark={Math.ceil(lesson.quizCount * 0.75)}
          title={`${lesson.title} — quiz`}
          kicker={lesson.title}
          onExitHref="/driving/learn"
          onComplete={() => markLessonDone(lesson.id)}
        />
      </Shell>
    );

  /* ── reading ── */
  if (mode === "read" && lesson) {
    const sec = lesson.sections[step];
    const last = step >= lesson.sections.length - 1;
    return (
      <Shell>
        <TopBar active="/driving/learn" />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 30 }}>{lesson.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.serif, fontSize: 26, lineHeight: 1.1 }}>{lesson.title}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
              Section {step + 1} of {lesson.sections.length}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <ProgressBar value={step + 1} max={lesson.sections.length + 1} color={C.grn} />
        </div>

        <div style={{ ...card, padding: "26px 26px" }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>{sec.heading}</h2>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {sec.points.map((p, i) => (
              <li key={i} style={{ display: "flex", gap: 12, fontSize: 15.5, lineHeight: 1.5, color: C.text }}>
                <span style={{ color: C.grn, flexShrink: 0, fontWeight: 700 }}>›</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
          <button
            onClick={() => (step === 0 ? setMode("index") : setStep((s) => s - 1))}
            style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, background: "none", border: "none", cursor: "pointer" }}
          >
            ← {step === 0 ? "All lessons" : "Back"}
          </button>
          {last ? (
            <button onClick={() => { setSeed((s) => s + 1); setMode("quiz"); }} style={primaryBtn}>
              Take the quiz →
            </button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)} style={primaryBtn}>Next →</button>
          )}
        </div>
      </Shell>
    );
  }

  /* ── index ── */
  return (
    <Shell>
      <TopBar active="/driving/learn" />
      <PageTitle
        kicker="Learn"
        title="Learn the theory"
        sub="Short, focused lessons on each topic of the UK theory test. Read the key points, then finish with a few quick questions to check you've got it."
      />
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginBottom: 14 }}>
        {done.length} of {LESSONS.length} lessons completed
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {LESSONS.map((l) => {
          const isDone = done.includes(l.id);
          return (
            <button
              key={l.id}
              onClick={() => open(l)}
              style={{ ...card, textAlign: "left", padding: "18px 18px", cursor: "pointer", fontFamily: "inherit", position: "relative", transition: "border-color .12s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.grn)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
            >
              {isDone && (
                <span style={{ position: "absolute", top: 12, right: 12, fontFamily: C.mono, fontSize: 11, color: C.grn, fontWeight: 700 }}>✓ done</span>
              )}
              <div style={{ fontSize: 28, marginBottom: 8 }}>{l.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 5, paddingRight: 40 }}>{l.title}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>{l.blurb}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                {l.sections.length} sections · {l.quizCount}-question quiz →
              </div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

const primaryBtn = {
  padding: "11px 22px",
  borderRadius: 8,
  border: "none",
  background: C.accent,
  color: C.accentFg,
  fontFamily: C.mono,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
} as const;
