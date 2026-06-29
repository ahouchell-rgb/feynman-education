import type { Question } from "./types";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "./questions";
import { CATEGORIES } from "./categories";

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a mock theory test of `n` questions (50 in the real test), spread across
 * all 14 categories by round-robin sampling so every topic is represented, then
 * shuffled into a random order.
 */
export function buildMockTest(n = 50): Question[] {
  const pools = CATEGORIES.map((c) => shuffle(QUESTIONS_BY_CATEGORY[c.id] ?? []));
  const picked: Question[] = [];
  let round = 0;
  while (picked.length < n) {
    let addedThisRound = 0;
    for (const pool of pools) {
      if (picked.length >= n) break;
      if (pool[round]) {
        picked.push(pool[round]);
        addedThisRound++;
      }
    }
    if (addedThisRound === 0) break; // ran out of questions
    round++;
  }
  // top up from the whole bank if categories were too small
  if (picked.length < n) {
    const ids = new Set(picked.map((q) => q.id));
    for (const q of shuffle(QUESTIONS)) {
      if (picked.length >= n) break;
      if (!ids.has(q.id)) picked.push(q);
    }
  }
  return shuffle(picked.slice(0, n));
}

export const THEORY_TOTAL = 50;
export const THEORY_PASS_MARK = 43;
export const THEORY_TIME_SEC = 57 * 60; // 57 minutes
