/* ─── Spaced Repetition (SM-2) ───
 * Extracted from src/app/page.js so the scheduling maths can be unit-tested.
 * Pure: given the previous {ef, iv, reps} and whether the answer was correct,
 * returns the next interval and due date. No React, no I/O. */
export function nextSR(correct, prev = {}) {
  let { ef = 2.5, iv = 0, reps = 0 } = prev;
  if (correct) { reps++; iv = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(iv * ef); ef = Math.max(1.3, ef + 0.1); }
  else { reps = 0; iv = 0; ef = Math.max(1.3, ef - 0.2); }
  const d = new Date(); d.setDate(d.getDate() + iv);
  return { ef, iv, reps, due: d.toISOString() };
}
