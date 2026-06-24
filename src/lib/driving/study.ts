import type { Progress } from "./storage";
import type { Question, CategoryId } from "./types";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "./questions";
import { CATEGORIES } from "./categories";
import { shuffle } from "./mock";

/* Adaptive-study helpers. These turn the per-question / per-category stats that
 * storage already records into useful study tools: a readiness score, a smart
 * practice set that targets weak areas and previously-wrong questions, and a
 * review-mistakes deck. All pure functions so they're easy to test. */

export interface Readiness {
  /** 0–100 overall readiness */
  percent: number;
  label: string;
  accuracy: number; // 0–1 overall question accuracy
  coverage: number; // 0–1 fraction of the bank attempted
  mockAvg: number | null; // 0–1 average of recent mock scores, or null
}

export function readiness(p: Progress): Readiness {
  const seen = Object.values(p.questions);
  const totalSeen = seen.reduce((a, q) => a + q.seen, 0);
  const totalCorrect = seen.reduce((a, q) => a + q.correct, 0);
  const accuracy = totalSeen ? totalCorrect / totalSeen : 0;
  const coverage = QUESTIONS.length ? Object.keys(p.questions).length / QUESTIONS.length : 0;

  const recent = p.theoryAttempts.slice(0, 5);
  const mockAvg = recent.length ? recent.reduce((a, r) => a + r.score / r.total, 0) / recent.length : null;

  const core = mockAvg != null ? 0.45 * mockAvg + 0.4 * accuracy : 0.85 * accuracy;
  const percent = Math.round(100 * Math.min(1, core + 0.15 * coverage));

  let label = "Just getting started";
  if (totalSeen === 0) label = "Take a lesson or a quiz to begin";
  else if (percent >= 85) label = "Test-ready — book it!";
  else if (percent >= 70) label = "Nearly there";
  else if (percent >= 45) label = "Getting there";
  else label = "Keep practising";

  return { percent, label, accuracy, coverage, mockAvg };
}

export interface CategoryStat {
  id: CategoryId;
  label: string;
  seen: number;
  correct: number;
  accuracy: number | null; // null if never seen
}

export function categoryStats(p: Progress): CategoryStat[] {
  return CATEGORIES.map((c) => {
    const s = p.categories[c.id];
    return {
      id: c.id,
      label: c.label,
      seen: s?.seen ?? 0,
      correct: s?.correct ?? 0,
      accuracy: s && s.seen ? s.correct / s.seen : null,
    };
  });
}

/** Weakest topics first: never-seen and low-accuracy topics float to the top. */
export function weakestCategories(p: Progress, n = 3): CategoryStat[] {
  return [...categoryStats(p)]
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1))
    .slice(0, n);
}

/** Questions the learner has answered at least once and got wrong at least once. */
export function reviewMistakes(p: Progress): Question[] {
  return QUESTIONS.filter((q) => {
    const s = p.questions[q.id];
    return s && s.seen > 0 && s.correct < s.seen;
  });
}

/** A weight for how much a question "needs" practice (higher = more). */
function needWeight(q: Question, p: Progress): number {
  const s = p.questions[q.id];
  if (!s || s.seen === 0) return 3; // never seen
  const wrongRate = (s.seen - s.correct) / s.seen;
  if (s.correct < s.seen) return 4 + wrongRate * 4; // got it wrong before
  return 1; // always right — least urgent
}

/**
 * Build an adaptive practice set of `n` questions, weighted toward weak topics
 * and questions answered incorrectly before (a light spaced-repetition effect).
 */
export function buildSmartSet(p: Progress, n = 20): Question[] {
  const catAcc: Record<string, number> = {};
  for (const c of categoryStats(p)) catAcc[c.id] = c.accuracy ?? 0; // unseen → 0 (weak)

  const pool = QUESTIONS.map((q) => ({
    q,
    w: needWeight(q, p) * (1 + (1 - (catAcc[q.category] ?? 0))),
  }));

  const picked: Question[] = [];
  const remaining = [...pool];
  while (picked.length < n && remaining.length) {
    const total = remaining.reduce((a, r) => a + r.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].w;
      if (r <= 0) { idx = i; break; }
    }
    picked.push(remaining[idx].q);
    remaining.splice(idx, 1);
  }
  return shuffle(picked);
}
