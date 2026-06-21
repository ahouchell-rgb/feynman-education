# Revision Pack — implementation

Strategy product #3. One click on a unit produces a printable **revision booklet** for
pupils/parents — and surfaces your otherwise-underused **interactive-science.com**
resources via the `resource_map` crosswalk.

## What shipped

| Piece | File |
|---|---|
| Generator API | `src/app/api/revision-pack/route.ts` |
| Entry point | `src/app/unit/[unitId]/page.tsx` — **📖 Revision pack** button |

## How it works

Loads the unit (`content`, `big_idea`, `misconceptions`, …) **and** its mapped resources
from `resource_map` under RLS, builds full resource URLs (`origin` + `href`, de-duped),
and has Claude (Sonnet, same auth + daily-spend backstop) write a printable A4 booklet:

- intro + big idea, **key terms** glossary, **must-know facts** (+ equations),
- **worked example(s)**, **8–10 practice questions** (answers grouped at the end so pupils
  self-test first), a **"Watch out for"** misconceptions section, and
- **"Practise more online"** — the unit's interactive-science.com tools linked by name.

The button opens the booklet in a new tab to print/share.

## Notes

- **No new env** (uses `ANTHROPIC_API_KEY` + the shared daily spend cap).
- Bounded to the unit content (the prompt forbids inventing beyond it); links use only the
  `resource_map` URLs.
- This is the teacher-generated form; the parent-facing strategy step is to expose
  per-child revision packs (built from a pupil's weak objectives) in the parent portal once
  the per-pupil retrieval RPC lands.
