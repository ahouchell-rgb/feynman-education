"use client";
import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { QuestionRunner } from "@/components/driving/QuestionRunner";
import { CATEGORIES } from "@/lib/driving/categories";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "@/lib/driving/questions";
import { shuffle } from "@/lib/driving/mock";
import { loadProgress } from "@/lib/driving/storage";
import type { Question } from "@/lib/driving/types";

export default function PracticePage() {
  const [active, setActive] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);

  useEffect(() => setFlaggedIds(loadProgress().flagged), [active]);

  const questions: Question[] = useMemo(() => {
    if (!active) return [];
    if (active === "flagged") return shuffle(QUESTIONS.filter((q) => flaggedIds.includes(q.id)));
    return shuffle(QUESTIONS_BY_CATEGORY[active] ?? []);
  }, [active, flaggedIds, seed]);

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
          kicker={active === "flagged" ? "Flagged questions" : CATEGORIES.find((c) => c.id === active)?.label}
          onExitHref="/driving/practice"
        />
      </Shell>
    );

  return (
    <Shell>
      <TopBar active="/driving/practice" />
      <PageTitle
        kicker="Untimed practice"
        title="Practice by topic"
        sub="Work through one topic at a time with the answer and explanation shown after every question. No timer, no pressure — perfect for building up your weak areas."
      />

      {flaggedIds.length > 0 && (
        <button
          onClick={() => { setSeed((s) => s + 1); setActive("flagged"); }}
          style={{ ...card, width: "100%", textAlign: "left", padding: "16px 18px", marginBottom: 18, cursor: "pointer", borderColor: C.amb, fontFamily: "inherit", borderWidth: 1, borderStyle: "solid", background: C.ambS }}
        >
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.amb }}>★ Flagged</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>Revise your {flaggedIds.length} flagged question{flaggedIds.length > 1 ? "s" : ""}</div>
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {CATEGORIES.map((c) => {
          const count = (QUESTIONS_BY_CATEGORY[c.id] ?? []).length;
          return (
            <button
              key={c.id}
              onClick={() => { setSeed((s) => s + 1); setActive(c.id); }}
              style={{ ...card, textAlign: "left", padding: "16px 18px", cursor: "pointer", fontFamily: "inherit", transition: "border-color .12s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.text)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{c.label}</div>
              <div style={{ fontSize: 13, color: C.muted, margin: "5px 0 8px", lineHeight: 1.4 }}>{c.blurb}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{count} questions →</div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
