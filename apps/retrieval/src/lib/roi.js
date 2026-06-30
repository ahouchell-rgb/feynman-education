/* ─── Marking-time-saved ROI ───
 * The product's core promise is "get your marking time back", but it was never
 * quantified where it matters at renewal. Every AI-marked written answer is one
 * answer a teacher didn't have to mark by hand, so we turn the response count into
 * an estimate of staff time saved.
 *
 * SECONDS_PER_MARK is a single named, tunable constant — a deliberately
 * conservative estimate of the marking + feedback time for one short written
 * answer. Keep it here so HodPanel and Teacher show the same figure and it can be
 * re-tuned in one place.
 *
 * This is an ESTIMATE, not a measured value — the UI must label it as such and
 * carry the "how this is calculated" footnote. Don't fabricate precision. */
export const SECONDS_PER_MARK = 20;

// One school day of marking time, used to express larger savings in "days".
const SECONDS_PER_DAY = 6 * 60 * 60; // 6h of contact-free marking time

// Turn a count of marked responses into { hours, label, footnote }.
// label is a short human string ("3.5 hours", "2.1 days"); hours is the raw number
// for callers that want to format it themselves.
export function markingTimeSaved(responsesMarked) {
  const n = Math.max(0, responsesMarked || 0);
  const seconds = n * SECONDS_PER_MARK;
  const hours = seconds / 3600;

  let label;
  if (hours < 1) {
    const mins = Math.round(seconds / 60);
    label = `${mins} min`;
  } else if (seconds < SECONDS_PER_DAY * 2) {
    label = `${hours.toFixed(1)} hours`;
  } else {
    label = `${(seconds / SECONDS_PER_DAY).toFixed(1)} days`;
  }

  return {
    responsesMarked: n,
    seconds,
    hours,
    label,
    footnote: `Estimate: ${n.toLocaleString()} AI-marked answers × ${SECONDS_PER_MARK}s of marking + feedback each. A "day" is ${SECONDS_PER_DAY / 3600}h of marking time. Indicative only.`,
  };
}
