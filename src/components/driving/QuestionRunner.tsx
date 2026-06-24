"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "@/lib/theme";
import type { Question } from "@/lib/driving/types";
import { CATEGORY_LABEL } from "@/lib/driving/categories";
import { recordAnswer, loadProgress, toggleFlag } from "@/lib/driving/storage";
import { ProgressBar, fmtTime, card } from "./ui";

export interface RunResult {
  score: number;
  total: number;
  seconds: number;
  passed: boolean;
  perCategory: Record<string, { correct: number; total: number }>;
}

interface Props {
  questions: Question[];
  /** reveal the correct answer + explanation immediately after each question */
  instantFeedback: boolean;
  /** total time allowed, seconds; null = untimed */
  durationSec: number | null;
  /** pass mark (number correct); null = practice, no pass/fail */
  passMark: number | null;
  title: string;
  kicker?: string;
  onExitHref?: string;
  onComplete?: (r: RunResult) => void;
}

const setsEqual = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export function QuestionRunner({
  questions,
  instantFeedback,
  durationSec,
  passMark,
  title,
  kicker,
  onExitHref = "/driving",
  onComplete,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(durationSec ?? 0);
  const [finished, setFinished] = useState(false);
  const recorded = useRef<Set<string>>(new Set());
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
    setFlagged(loadProgress().flagged);
  }, []);

  const q = questions[idx];
  const sel = picks[q?.id] ?? [];
  const isRevealed = !!revealed[q?.id];

  const finish = useCallback(() => {
    let score = 0;
    const perCategory: Record<string, { correct: number; total: number }> = {};
    for (const question of questions) {
      const chosen = picks[question.id] ?? [];
      const ok = setsEqual(chosen, question.correct);
      if (ok) score += 1;
      const pc = (perCategory[question.category] ||= { correct: 0, total: 0 });
      pc.total += 1;
      if (ok) pc.correct += 1;
      // ensure every question is recorded once (exam mode records at the end)
      if (!recorded.current.has(question.id)) {
        recorded.current.add(question.id);
        recordAnswer(question.id, question.category, ok);
      }
    }
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const passed = passMark == null ? score === questions.length : score >= passMark;
    const result: RunResult = { score, total: questions.length, seconds, passed, perCategory };
    setFinished(true);
    onComplete?.(result);
  }, [questions, picks, passMark, onComplete]);

  // countdown timer
  useEffect(() => {
    if (!durationSec || finished) return;
    if (timeLeft <= 0) {
      finish();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [durationSec, timeLeft, finished, finish]);

  if (!q && !finished) return null;
  if (finished)
    return (
      <Results
        questions={questions}
        picks={picks}
        passMark={passMark}
        seconds={Math.round((Date.now() - startedAt.current) / 1000)}
        title={title}
        onExitHref={onExitHref}
      />
    );

  const toggle = (optIdx: number) => {
    if (isRevealed) return;
    setPicks((prev) => {
      const cur = prev[q.id] ?? [];
      if (q.selectCount === 1) return { ...prev, [q.id]: cur[0] === optIdx ? [] : [optIdx] };
      const has = cur.includes(optIdx);
      if (has) return { ...prev, [q.id]: cur.filter((i) => i !== optIdx) };
      if (cur.length >= q.selectCount) return prev; // cap selections
      return { ...prev, [q.id]: [...cur, optIdx] };
    });
  };

  const reveal = () => {
    setRevealed((r) => ({ ...r, [q.id]: true }));
    if (!recorded.current.has(q.id)) {
      recorded.current.add(q.id);
      recordAnswer(q.id, q.category, setsEqual(sel, q.correct));
    }
  };

  const next = () => {
    if (idx + 1 >= questions.length) finish();
    else setIdx((i) => i + 1);
  };

  const onFlag = () => setFlagged(toggleFlag(q.id).flagged);

  const enoughPicked = sel.length === q.selectCount;
  const showActionCheck = instantFeedback && !isRevealed;

  return (
    <div>
      {/* status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
          {kicker ? kicker + " · " : ""}Question {idx + 1} of {questions.length}
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <ProgressBar value={idx + (isRevealed || !instantFeedback ? 1 : 0)} max={questions.length} />
        </div>
        {durationSec != null && (
          <div
            style={{
              fontFamily: C.mono,
              fontSize: 14,
              fontWeight: 600,
              color: timeLeft < 60 ? C.red : C.text,
              minWidth: 56,
              textAlign: "right",
            }}
            aria-label="time remaining"
          >
            ⏱ {fmtTime(timeLeft)}
          </div>
        )}
      </div>

      <div style={{ ...card, padding: "26px 26px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>
            {CATEGORY_LABEL[q.category] || q.category}
          </span>
          <button
            onClick={onFlag}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: flagged.includes(q.id) ? C.amb : C.faint }}
            aria-pressed={flagged.includes(q.id)}
            title="Flag this question to revise later"
          >
            {flagged.includes(q.id) ? "★ flagged" : "☆ flag"}
          </button>
        </div>
        <h2 style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 1.2, fontWeight: 400, marginBottom: 4 }}>{q.question}</h2>
        {q.selectCount > 1 && (
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amb, marginBottom: 8 }}>Mark {q.selectCount} answers</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {q.options.map((opt, i) => {
            const chosen = sel.includes(i);
            const correct = q.correct.includes(i);
            let bg = C.surface;
            let border = C.border;
            let mark = "";
            if (isRevealed) {
              if (correct) { bg = C.grnS; border = C.grn; mark = "✓"; }
              else if (chosen) { bg = C.redS; border = C.red; mark = "✗"; }
            } else if (chosen) {
              bg = C.bluS; border = C.blu;
            }
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                disabled={isRevealed}
                style={{
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 15px",
                  borderRadius: 8,
                  border: `1.5px solid ${border}`,
                  background: bg,
                  cursor: isRevealed ? "default" : "pointer",
                  fontFamily: "inherit",
                  fontSize: 15,
                  color: C.text,
                  transition: "all .12s",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: q.selectCount > 1 ? 5 : 99,
                    border: `1.5px solid ${chosen || (isRevealed && correct) ? border : C.faint}`,
                    background: chosen || (isRevealed && correct) ? border : "transparent",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {mark || (chosen ? (q.selectCount > 1 ? "✓" : "•") : "")}
                </span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>

        {isRevealed && (
          <div
            style={{
              marginTop: 18,
              padding: "14px 16px",
              borderRadius: 8,
              background: setsEqual(sel, q.correct) ? C.grnS : C.redS,
              border: `1px solid ${setsEqual(sel, q.correct) ? C.grn : C.red}`,
            }}
          >
            <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: setsEqual(sel, q.correct) ? C.grn : C.red, marginBottom: 6 }}>
              {setsEqual(sel, q.correct) ? "Correct" : "Not quite"}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: C.text }}>{q.explanation}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <a href={onExitHref} style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, textDecoration: "none" }}>
          ← Exit
        </a>
        <div style={{ display: "flex", gap: 10 }}>
          {showActionCheck ? (
            <button onClick={reveal} disabled={!enoughPicked} style={btn(enoughPicked)}>
              Check answer
            </button>
          ) : (
            <button onClick={next} disabled={!instantFeedback && !enoughPicked} style={btn(instantFeedback ? true : enoughPicked)}>
              {idx + 1 >= questions.length ? "Finish" : "Next question →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const btn = (enabled: boolean) => ({
  padding: "11px 22px",
  borderRadius: 8,
  border: "none",
  background: enabled ? C.accent : C.border,
  color: enabled ? C.accentFg : C.dim,
  fontFamily: C.mono,
  fontSize: 13,
  fontWeight: 600,
  cursor: enabled ? "pointer" : "default",
});

/* ── Results screen ── */
function Results({
  questions,
  picks,
  passMark,
  seconds,
  title,
  onExitHref,
}: {
  questions: Question[];
  picks: Record<string, number[]>;
  passMark: number | null;
  seconds: number;
  title: string;
  onExitHref: string;
}) {
  const [showReview, setShowReview] = useState(false);
  const score = questions.filter((q) => setsEqual(picks[q.id] ?? [], q.correct)).length;
  const passed = passMark == null ? score === questions.length : score >= passMark;
  const perCat = useMemo(() => {
    const m: Record<string, { correct: number; total: number }> = {};
    for (const q of questions) {
      const pc = (m[q.category] ||= { correct: 0, total: 0 });
      pc.total += 1;
      if (setsEqual(picks[q.id] ?? [], q.correct)) pc.correct += 1;
    }
    return m;
  }, [questions, picks]);

  return (
    <div>
      <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: passed ? C.grn : C.red }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.dim }}>{title} · Result</div>
        <div style={{ fontFamily: C.serif, fontSize: 60, lineHeight: 1, margin: "12px 0", color: passed ? C.grn : C.red }}>
          {score}/{questions.length}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: passed ? C.grn : C.red }}>
          {passMark == null ? (passed ? "All correct!" : "Practice complete") : passed ? "PASS" : "NOT YET — keep practising"}
        </div>
        {passMark != null && (
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
            Pass mark is {passMark}/{questions.length}. Time taken {fmtTime(seconds)}.
          </div>
        )}
      </div>

      <h3 style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, margin: "26px 0 12px" }}>
        By topic
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(perCat).map(([cat, v]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, width: 220, color: C.text }}>{CATEGORY_LABEL[cat] || cat}</span>
            <div style={{ flex: 1 }}>
              <ProgressBar value={v.correct} max={v.total} color={v.correct === v.total ? C.grn : v.correct / v.total >= 0.6 ? C.amb : C.red} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, width: 44, textAlign: "right" }}>
              {v.correct}/{v.total}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
        <button onClick={() => setShowReview((s) => !s)} style={btn(true)}>
          {showReview ? "Hide review" : "Review answers"}
        </button>
        <a href={onExitHref} style={{ ...btn(true), textDecoration: "none", display: "inline-block", background: C.surface, color: C.text, border: `1px solid ${C.border}` }}>
          Back to home
        </a>
        <a href={typeof window !== "undefined" ? window.location.pathname : "#"} style={{ ...btn(true), textDecoration: "none", display: "inline-block", background: C.surface, color: C.text, border: `1px solid ${C.border}` }}>
          Try again
        </a>
      </div>

      {showReview && (
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q, n) => {
            const chosen = picks[q.id] ?? [];
            const ok = setsEqual(chosen, q.correct);
            return (
              <div key={q.id} style={{ ...card, padding: "16px 18px", borderColor: ok ? C.border : C.red }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: ok ? C.grn : C.red, marginBottom: 6 }}>
                  {n + 1}. {ok ? "✓ Correct" : "✗ Incorrect"} · {CATEGORY_LABEL[q.category] || q.category}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{q.question}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {q.options.map((opt, i) => {
                    const correct = q.correct.includes(i);
                    const picked = chosen.includes(i);
                    return (
                      <div key={i} style={{ fontSize: 13, color: correct ? C.grn : picked ? C.red : C.muted, display: "flex", gap: 6 }}>
                        <span>{correct ? "✓" : picked ? "✗" : "·"}</span>
                        <span>{opt}{picked && !correct ? " (your answer)" : ""}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45, borderTop: `1px solid ${C.rule}`, paddingTop: 8 }}>{q.explanation}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
