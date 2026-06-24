import { MAX_PER_HAZARD } from "./hazardClips";

/**
 * Score a single developing hazard from the times (seconds) the learner clicked.
 * The window [windowStart, windowEnd] is split into 5 equal bands; a click in
 * the earliest band scores 5, the next 4, … the last 1. Clicks outside the
 * window don't count. The best qualifying click wins (extra clicks don't add).
 */
export function scoreHazard(windowStart: number, windowEnd: number, clicks: number[]): number {
  const band = (windowEnd - windowStart) / MAX_PER_HAZARD;
  let best = 0;
  for (const ct of clicks) {
    if (ct < windowStart || ct > windowEnd) continue;
    const score = MAX_PER_HAZARD - Math.floor((ct - windowStart) / band);
    best = Math.max(best, Math.min(MAX_PER_HAZARD, Math.max(1, score)));
  }
  return best;
}

/**
 * Button-mashing / steady-rhythm clicking scores 0 for the clip in the real
 * test. Flag it when there are too many clicks, or when the gaps between clicks
 * are suspiciously regular.
 */
export function detectCheat(clicks: number[]): boolean {
  if (clicks.length > 12) return true;
  if (clicks.length >= 8) {
    const gaps: number[] = [];
    for (let i = 1; i < clicks.length; i++) gaps.push(clicks[i] - clicks[i - 1]);
    const max = Math.max(...gaps);
    const min = Math.min(...gaps);
    if (max - min < 0.4) return true;
  }
  return false;
}
