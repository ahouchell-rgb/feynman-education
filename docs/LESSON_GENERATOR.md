# One-click AI Lesson Generator — implementation

Strategy item #11 (Phase 0, the teacher wedge). "Generate the lesson for this unit" →
a full, ready-to-teach slide deck in one click. This widens the free top-of-funnel that
feeds the whole flywheel (more teachers → more retrieval data → more value everywhere).

## What shipped

| Piece | File |
|---|---|
| Generator API | `src/app/api/lesson-generator/route.ts` |
| Entry point | `src/app/slides/page.tsx` — **✨ Generate lesson** button + modal |

## How it works (orchestration, not a new model)

```
/api/lesson-generator (teacher JWT)
  ├─ load unit (+ optional lesson) context under RLS  (title, discipline, year, keywords)
  ├─ build a house-template instruction from that context
  ├─ POST → /api/slides-assistant  { slides: [], instruction }   ← the PROVEN generator
  │         (same Opus apply_edits tool, house lesson template, font/HTML restore,
  │          auth + daily-spend metering all reused)
  └─ persist a `decks` row (owner = teacher) → return { deckId }
                                   │
                          client opens /slides?deck=<id> in the editor
```

It deliberately **reuses `slides-assistant`** rather than adding a parallel prompt/tool to
maintain — the lesson generator is just context-building + persistence around the
generator teachers already trust. The result is a normal editable deck (edit, present,
export, share, make official — all existing flows).

## Using it

Slides → **✨ Generate lesson** → pick a unit (optionally a specific lesson, optionally a
focus like "exam technique on the required practical") → **Generate**. ~20–40s later the
deck opens in the editor.

## Lesson → practice in one flow

After a generated deck opens, the editor **auto-opens the existing retrieval-questions
modal** (`DeckQuestionsModal`) so the teacher goes straight from "lesson made" to
"draft + save retrieval questions" — closing the loop back to the mastery graph in a
single sitting. Implemented with an `autoQuestions` prop on `SlideEditor` (fires once on
mount); the slides page sets it only for the just-generated deck and clears it on close.
The save path is unchanged — it writes to the same `questions` bank as the in-app flow,
governed by the same RLS / plan-gate.

## Notes / next steps

- **No new env.** Uses `ANTHROPIC_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (consumed by
  slides-assistant / deck-to-questions) and the per-teacher daily spend cap enforced there.
- **From a unit page.** The entry point is on Slides today; adding the same action to the
  unit page would put it exactly where teachers plan.
- Generation time is bounded by slides-assistant (Opus); the instruction targets ~8–14
  slides to stay within timeouts.
