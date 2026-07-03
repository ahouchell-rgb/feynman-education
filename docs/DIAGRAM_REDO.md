# Diagram redo — align build-up diagrams to Springboard Teacher Handbooks

**Goal (from user):** Redo the app's build-up diagrams so they mirror how the
Springboard Teacher Handbooks break down knowledge — a slowly-built "blank canvas"
PowerPoint where each part is revealed in turn with a short line of narration
explaining it (the handbooks' *Guided explanation* sections).

**Source material:** `~/Documents/Science Misc/springboard/Teacher handbook {1,2,3}.pdf`
(extracted to scratchpad `handbook{1,2,3}.txt`). ~390 *Guided explanation* blocks
across the three books, each with numbered draw-this-then-say-that steps.

## How the app models a build-up diagram
- `DIAGRAMS[key] = { vb, svg, parts:[{id,label,x,y,note}] }` in `springboard.html`.
- `content.js` unit: `"diagram":{"key":..., "map":[factIdx -> partId(s)]}` — the
  `map` sets the reveal order; each fact step reveals its part(s).
- `springboard.html` `revealSteps()` splits multi-part facts so **one part + one
  `note` appears per step** (cognitive-load control). The `note` is the narration
  shown as each part builds — this is the "text explaining each section as it
  progresses" the user asked for.

## Progress
- **117 diagrams total; 110 units wired to one.**
- **DONE (2026-07-03):** The 14 legacy diagrams that had **zero** part narration
  now have handbook-voiced notes (51 parts), so **all 117 diagrams are narrated**:
  `animalCell, plantCell, atom, circuit, microscope, particleStates, arm, lungs,
  digestive, wave, reflection, forces, foodChain, skeleton`.
  Verified: DIAGRAMS block parses in node (117 diagrams, 697 noted parts); app
  loads with no console errors.

- **DONE (2026-07-03) — teach-before-quiz fix (the main ask):** `buildLessons`
  used to round-robin the ~5 facts across all lessons (`splitEven`) while chunking
  the ~30 questions contiguously, so early lessons quizzed facts taught many
  lessons later (P1: lesson 0 taught 1 fact but asked 5 questions covering facts
  1–8). Restructured to the handbook model — **Guided explanation → Check for
  understanding → Independent practice**: every fact builds the diagram in order
  and teaches its vocab in *learn* lessons FIRST, then the full question bank runs
  in *practice* lessons. Verified across all 141 units: **0 cases** of a fact/word
  taught after a bank question begins. Diagram still builds one part per step;
  worked example precedes the first numeric; capstone label-the-diagram stays last.

- **DONE (2026-07-03) — reveal-order audit (task a):** Generated a fact→revealed-part
  alignment table for all 110 diagram-bearing units and scanned every one. Most build
  orders are sound; harmless re-reveals (a part re-highlighted by a later fact) were
  left as-is. Fixed one real bug: **LGT Light** revealed the reflected ray at fact 6
  ("we see objects"), *after* refraction, so the reflection-law fact (f4) drew only the
  normal with no reflected ray to compare angles against. Moved `reflectedRay` to f4
  (with the normal) and cleared f6. New order: incident+mirror → normal+reflected →
  refracted → prism+spectrum. Verified in-runtime; teach-before-quiz still 0 violations.

## Next iterations (loop)
1. **Audit reveal ORDER** of the 14 legacy diagrams' `map` in content.js against
   the handbook's numbered step order (e.g. microscope light-path bottom-up;
   reflection = mirror→normal→incident→reflected).
2. **Cross-check narrated `d_*` diagrams** against their handbook Guided
   explanation — tighten any note that diverges from the book's wording/step order.
3. **Coverage gap:** units that have a Guided-explanation diagram in the handbook
   but NO app diagram — add build-up diagrams for those.
