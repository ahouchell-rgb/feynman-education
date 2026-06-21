# Cover / Non-Specialist Mode — implementation

Strategy product #8. Turns any slide deck into a **printable cover lesson script** so a
cover teacher or non-specialist (who doesn't know the science) can deliver the lesson
confidently — directly addressing the science recruitment/cover crisis (a high
willingness-to-pay pain for schools).

## What shipped

| Piece | File |
|---|---|
| Generator API | `src/app/api/cover-sheet/route.ts` |
| Entry point | `src/app/slides/page.tsx` — **📋 Cover script** button (signed-in) |

## How it works

The deck is flattened slide-by-slide (titles, body, tables, equations, timers, speaker
notes) and sent to Claude (Sonnet, same auth + spend backstop as the feedforward route),
which writes a printable A4 script:

- a plain-English **overview** + the single big idea;
- a **"Before you start"** box (equipment + a safety line deferring to the school's risk
  assessment for any practical);
- per slide: **Say** (read-aloud explanation), **On screen / do** (+ timings), and
  **Answers** for any question/MCQ;
- an "if you finish early" line.

The button opens the result in a new tab to read/print. It pairs with the one-click lesson
generator: **generate a lesson → generate its cover script** in two clicks.

## Notes

- **No new env** (uses `ANTHROPIC_API_KEY` + the shared daily spend cap).
- Accuracy is bounded to the slide content (the prompt forbids inventing science), but a
  non-specialist should still follow the school's risk assessment — the script says so.
- Next: a per-lesson saved cover script, and a deck-level "make official" cover pack for a
  department's shared schemes.
