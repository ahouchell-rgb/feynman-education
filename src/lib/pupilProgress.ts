// Feynman Education — pupil-facing progress copy (pure, no I/O).
//
// Used by the pupil "my progress / what to practise" view inside the parent
// portal (src/app/parent/page.tsx). Kept here so the wording is unit-testable
// and stays consistent. All mastery data is fetched server-side elsewhere; this
// module only turns a recent practice score into an encouraging line.

/** A friendly, pupil-addressed progress line from their recent practice score
 *  (0–100, or null when there's no data yet). `weakCount` lets us nudge toward
 *  the topics list when there's something concrete to work on. */
export function pupilProgressLine(recentScore: number | null, weakCount: number): string {
  if (recentScore == null) return "Once you practise a few questions, your progress shows up here.";
  if (recentScore >= 80) return `You're flying — ${recentScore}% on your recent practice. Keep it up!`;
  if (recentScore >= 65) return `Solid work — ${recentScore}% on your recent practice. A little more and you'll nail it.`;
  if (recentScore >= 40) return `You're getting there — ${recentScore}% so far. ${weakCount ? "A few topics below will give you the biggest boost." : "Keep going!"}`;
  return `Early days — ${recentScore}% so far. ${weakCount ? "Start with one topic below; small wins add up fast." : "Every question you try helps."}`;
}
