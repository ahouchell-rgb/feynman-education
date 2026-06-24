"use client";
import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { QuestionRunner } from "@/components/driving/QuestionRunner";
import { CATEGORIES } from "@/lib/driving/categories";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "@/lib/driving/questions";
import { shuffle } from "@/lib/driving/mock";
import { loadProgress, Progress } from "@/lib/driving/storage";
import { buildSmartSet, reviewMistakes, weakestCategories } from "@/lib/driving/study";
import type { Question } from "@/lib/driving/types";

export default function PracticePage() {
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [seed, setSeed] = useState(0);

  useEffect(() => setProgress(loadProgress()), [active]);
  const flaggedIds = progress?.flagged ?? [];

  const questions: Question[] = useMemo(() => {
    if (!active || !progress) return [];
    if (active === "flagged") return shuffle(QUESTIONS.filter((q) => flaggedIds.includes(q.id)));
    if (active === "smart") return buildSmartSet(progress, 20);
    if (active === "mistakes") return shuffle(reviewMistakes(progress));
    return shuffle(QUESTIONS_BY_CATEGORY[active] ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, progress, seed]);

  const kickerFor = (a: string) =>
    a === "flagged" ? "Flagged questions" : a === "smart" ? "Smart practice" : a === "mistakes" ? "Review mistakes" : CATEGORIES.find((c) => c.id === a)?.label;

  if (active && questions.length > 0)
    return (
      <Shell>
        <TopBar active="/driving/practice" />
        <QuestionRunner
          key={active + seed}
          questions={questions}
          instantFeedback
          durationSec={null}
          passMark={null}
          title="Practice"
          kicker={kickerFor(active)}
          onExitHref="/driving/practice"
        />
      </Shell>
    );

  const mistakes = progress ? reviewMistakes(progress) : [];
  const weak = progress ? weakestCategories(progress, 2).filter((c) => c.seen > 0) : [];
  const start = (a: string) => { setSeed((s) => s + 1); setActive(a); };

  return (
    <Shell>
      <TopBar active="/driving/practice" />
      <PageTitle
        kicker="Untimed practice"
        title="Practice"
        sub="Build up your weak areas with instant feedback and explanations. Let the app target what you need, review your mistakes, or pick a topic."
      />

      {/* smart tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
        <button
          onClick={() => start("smart")}
          style={{ ...card, textAlign: "left", padding: "18px", cursor: "pointer", fontFamily: "inherit", borderColor: C.grn, background: C.grnS, borderWidth: 1, borderStyle: "solid" }}
        >
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.grn }}>✦ Smart practice</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 5 }}>20 questions tuned to your weak areas</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
            {weak.length ? `Focusing on ${weak.map((w) => w.label).join(" & ")}` : "Targets the topics and questions you find hardest."}
          </div>
        </button>

        <button
          onClick={() => mistakes.length && start("mistakes")}
          disabled={!mistakes.length}
          style={{ ...card, textAlign: "left", padding: "18px", cursor: mistakes.length ? "pointer" : "default", fontFamily: "inherit", borderColor: mistakes.length ? C.red : C.border, background: mistakes.length ? C.redS : C.surface, borderWidth: 1, borderStyle: "solid", opacity: mistakes.length ? 1 : 0.6 }}
        >
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: mistakes.length ? C.red : C.dim }}>↺ Review mistakes</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 5 }}>{mistakes.length ? `Redo ${mistakes.length} you've got wrong` : "No mistakes yet"}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Practise every question you've answered incorrectly until they stick.</div>
        </button>

        {flaggedIds.length > 0 && (
          <button
            onClick={() => start("flagged")}
            style={{ ...card, textAlign: "left", padding: "18px", cursor: "pointer", fontFamily: "inherit", borderColor: C.amb, background: C.ambS, borderWidth: 1, borderStyle: "solid" }}
          >
            <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.amb }}>★ Flagged</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 5 }}>Revise your {flaggedIds.length} flagged</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Questions you starred to come back to.</div>
          </button>
        )}
      </div>

      <h2 style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, margin: "24px 0 12px" }}>By topic</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {CATEGORIES.map((c) => {
          const count = (QUESTIONS_BY_CATEGORY[c.id] ?? []).length;
          const stat = progress?.categories[c.id];
          return (
            <button
              key={c.id}
              onClick={() => start(c.id)}
              style={{ ...card, textAlign: "left", padding: "16px 18px", cursor: "pointer", fontFamily: "inherit", transition: "border-color .12s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.text)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{c.label}</div>
              <div style={{ fontSize: 13, color: C.muted, margin: "5px 0 8px", lineHeight: 1.4 }}>{c.blurb}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                {count} questions{stat && stat.seen ? ` · ${Math.round((stat.correct / stat.seen) * 100)}% so far` : ""} →
              </div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
