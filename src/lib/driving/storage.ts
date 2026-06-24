"use client";

/* Lightweight localStorage-backed progress store for the driving app. Everything
 * is client-side — no account needed — so a learner can practise and revise and
 * keep their stats on this device. All reads are SSR-safe (guard `window`). */

import type { CategoryId } from "./types";

const KEY = "uk-driving-progress-v1";

export interface AttemptResult {
  /** epoch ms */
  at: number;
  score: number;
  total: number;
  passed: boolean;
  /** seconds taken */
  seconds?: number;
}

export interface Progress {
  /** per-question history: id -> { seen, correct } */
  questions: Record<string, { seen: number; correct: number }>;
  /** per-category tallies */
  categories: Partial<Record<CategoryId, { seen: number; correct: number }>>;
  /** completed full mock theory tests */
  theoryAttempts: AttemptResult[];
  /** completed hazard perception runs */
  hazardAttempts: AttemptResult[];
  /** question ids the learner flagged to revise */
  flagged: string[];
  /** ids of Learn lessons completed (quiz finished) */
  lessonsDone: string[];
}

const EMPTY: Progress = {
  questions: {},
  categories: {},
  theoryAttempts: [],
  hazardAttempts: [],
  flagged: [],
  lessonsDone: [],
};

export function loadProgress(): Progress {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / private mode — ignore, app still works for this session */
  }
}

/** Record the outcome of answering a single question. */
export function recordAnswer(
  questionId: string,
  category: CategoryId,
  correct: boolean
): Progress {
  const p = loadProgress();
  const q = p.questions[questionId] || { seen: 0, correct: 0 };
  q.seen += 1;
  if (correct) q.correct += 1;
  p.questions[questionId] = q;

  const c = p.categories[category] || { seen: 0, correct: 0 };
  c.seen += 1;
  if (correct) c.correct += 1;
  p.categories[category] = c;

  saveProgress(p);
  return p;
}

export function recordTheoryAttempt(a: AttemptResult): Progress {
  const p = loadProgress();
  p.theoryAttempts = [a, ...p.theoryAttempts].slice(0, 50);
  saveProgress(p);
  return p;
}

export function recordHazardAttempt(a: AttemptResult): Progress {
  const p = loadProgress();
  p.hazardAttempts = [a, ...p.hazardAttempts].slice(0, 50);
  saveProgress(p);
  return p;
}

export function markLessonDone(lessonId: string): Progress {
  const p = loadProgress();
  if (!p.lessonsDone.includes(lessonId)) {
    p.lessonsDone.push(lessonId);
    saveProgress(p);
  }
  return p;
}

export function toggleFlag(questionId: string): Progress {
  const p = loadProgress();
  const i = p.flagged.indexOf(questionId);
  if (i >= 0) p.flagged.splice(i, 1);
  else p.flagged.push(questionId);
  saveProgress(p);
  return p;
}

export function resetProgress(): Progress {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  return { ...EMPTY };
}
