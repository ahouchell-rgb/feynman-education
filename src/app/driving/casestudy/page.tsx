"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { QuestionRunner } from "@/components/driving/QuestionRunner";
import { CASE_STUDIES, CaseStudy } from "@/lib/driving/caseStudies";

export default function CaseStudyPage() {
  const [active, setActive] = useState<CaseStudy | null>(null);

  if (active)
    return (
      <Shell>
        <TopBar active="/driving/casestudy" />
        <QuestionRunner
          key={active.id}
          questions={active.questions}
          instantFeedback
          durationSec={null}
          passMark={4}
          title={`Case study — ${active.title}`}
          kicker="Case study"
          onExitHref="/driving/casestudy"
          headerNote={
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.blu, marginBottom: 6 }}>
                Scenario · {active.title}
              </div>
              {active.scenario.map((s, i) => (
                <p key={i} style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{s}</p>
              ))}
            </div>
          }
        />
      </Shell>
    );

  return (
    <Shell>
      <TopBar active="/driving/casestudy" />
      <PageTitle
        kicker="Exam-style"
        title="Case study"
        sub="The real theory test includes a case study — a short scenario with five questions about it. Read the situation, then answer. Pick one to practise."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {CASE_STUDIES.map((cs) => (
          <button
            key={cs.id}
            onClick={() => setActive(cs)}
            style={{ ...card, textAlign: "left", padding: "18px", cursor: "pointer", fontFamily: "inherit", transition: "border-color .12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.blu)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
          >
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{cs.title}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>{cs.scenario[0]}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{cs.questions.length} questions →</div>
          </button>
        ))}
      </div>
    </Shell>
  );
}
