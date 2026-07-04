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

- **DONE (2026-07-03) — visual/scientific correctness audit (task b):** Rendered
  and eyeballed **all 117 diagrams** (paginated gallery, ~8 per screen). Every one
  is scientifically and visually correct across all topics and diagram types —
  atomic structure, gold-foil, radiation penetration/decay, cells (animal/plant),
  membrane transport, enzymes, circulatory/nervous/endocrine systems, genetics
  (Punnett, natural selection), circuits (series/parallel, motor, grid, electrolysis
  polarity), fields (magnet/static), ray optics, EM spectrum, waves, graphs (d–t,
  v–t, reaction profiles), particle model, states, density, pressure, periodic
  table, energy stores/efficiency, space/stellar life cycle, etc. No corrections
  needed; the LGT reveal-order fix (previous iteration) was the only issue the whole
  audit surfaced. Diagram correctness (goal #1) is confirmed met.

- **DONE (2026-07-03) — labels/markers were in the WRONG PLACES (user report):**
  The build-up labels, the "find it" tap hotspots, and the capstone pins were all
  positioned by hand-typed `x`/`y` percentages per part — many of which did not sit
  on the shape they named (measured errors up to 40%: the atom's "electron" pointed
  at empty space, the microscope "stage" floated left of the stage, the animal-cell
  "membrane" was 41% off). Worse, the wrong hotspot coordinates meant tapping the
  *correct* shape in a checkpoint could be marked wrong. Fixed at the root with
  `layoutDiagramSpots()`: after every diagram render it repositions each labelled
  overlay (`.dlabel` / `.hotspot` / `.dpin`, all keyed by `data-id`) onto the actual
  geometry of its SVG shape — the largest piece of a multi-part shape (e.g. one of
  two electrons), or the top edge of a big outline/background (e.g. an electron shell
  or cell membrane) so it doesn't sit over inner detail. Hand `x`/`y` remains only as
  a fallback for parts with no drawable geometry. Verified in real lessons (eyepiece
  label lands on the eyepiece), checkpoints, and the capstone; no console errors.
  NOTE: this supersedes the earlier "117/117 visually correct" audit — that pass
  checked the raw SVG art, not the label overlay the student actually sees.

- **DONE (2026-07-03) — verified label positioning across all 117 diagrams:**
  Confirmed every one of the 697 parts has a `data-part` element (an earlier
  count that flagged 95 "untagged" was a bad regex — these SVGs use single-quoted
  attributes), so the geometry positioner applies everywhere with no coordinate
  fallback in play. Swept the whole set rendering geometry-positioned labels: every
  label/dot lands on its shape — physics fields (magnet, motor, orbits), star life
  cycle, waves/EM spectrum, cells, circuits, graphs, chemistry apparatus, etc.
  Only cosmetic note: a couple of diagrams stack two background labels on the same
  spot when *all* labels are forced visible (animalCell membrane and cytoplasm are
  literally the same ellipse; d_GS1 orbit labels cluster) — irrelevant in real use,
  where only the current part's label shows. No code change needed; positioning is
  correct. Grading of the "find it" checkpoint is by `data-id`, not coordinates, so
  with hotspots now overlaying their shapes a correct tap registers correctly.

- **DONE (2026-07-04) — REP Reproduction: taught the concepts it was quizzing (task c).**
  REP had 9 facts but 103 questions, with whole clusters quizzed yet never taught.
  Read facts vs every question stem and cross-checked Teacher Handbook 2 (B5). Added
  the missing teaching (9→20 facts, +6 vocab), all handbook-accurate: gametes carry
  half the DNA; testes in the scrotum stay cool; glands add sugary seminal fluid;
  ovulation ~day 14; ovum adaptation (large cytoplasm food store); the full menstrual
  cycle (day 1 = menstruation/"period", lining rebuilds, implantation vs shedding);
  zygote→embryo→fetus(8wk); placenta adaptations + blood never mixes + harmful
  substances cross; pollen tube grows to the ovary; insect pollination via nectar;
  seed dispersal (wind/animals) and germination. Diagram map extended to keep the
  build order ovary→sperm→oviduct→placenta→umbilical+fetus. Verified: 25 lessons
  (teach-first), 0 teach-before-quiz violations (REP and globally), reveal order
  correct, renders with no console errors. (SPC Space was done the same way in the
  prior iteration, commit 4874f69.)

## Task (c) — teach-before-quiz coverage: scoping note (2026-07-03)
The teach-first restructure already **guarantees the structural property**: every
one of a unit's own facts (and its diagram build-up) is taught before any of that
unit's bank questions. The residual question for (c) is whether any quiz item tests
a concept that *no fact covers at all*.

An automated heuristic (flagging questions whose stem is >70% words absent from the
unit's facts/vocab) is **too noisy to act on**: it over-flags numeric word-problems
and scenario wording, and it flags the cross-topic revision units (`GPP*`, `GCP*`,
`GBP*`, etc.) which deliberately have **no facts of their own** — their content is
taught in the source topic units, so "0% local coverage" there is expected, not a
gap. So (c) must be **targeted manual review of specific KS3 topic units**, not an
automated sweep.

- **DONE (2026-07-03) — task (c) for SPC Space:** SPC had 9 facts but 123 questions,
  and many questions tested concepts no fact taught. Cross-checked against Teacher
  Handbook 3 (P11 Space guided explanations) and added 9 concise, factual (non-chatty)
  facts + 4 vocab covering the real gaps: solar system definition & dwarf planets/Pluto;
  planet sizes, elliptical orbits & why orbital periods differ; moon counts (Earth 1,
  Jupiter 92, 224 total); space distances (sunlight ≈8 min, Alpha Centauri ≈4.3 ly);
  Earth's parts (axis, 23.4° tilt, equator, hemispheres); day/night by spin not orbit;
  seasons by direct-vs-glancing sunlight & opposite hemispheres; the equator's low
  seasonal variation; weight as a non-contact force & weightlessness in deep space.
  Handbook figures used verbatim (23.4°, 224 moons, 4.3 ly). Verified: content parses,
  teach-before-quiz still 0 violations across all 141 units, new facts render in Learn
  lessons before practice, no console errors. Map untouched (new facts add no diagram
  parts). SPC: 9→18 facts, 6 learn + 21 practice lessons.

## Next iterations (loop)
1. **Task (c), manual (continue):** REP Reproduction and ECO Ecosystems next (both
   flagged as content-heavy); same method — read facts vs questions, add covering
   facts (not chatty narration) for genuinely untaught concepts, cross-check handbook.
2. **Coverage gap:** units that have a Guided-explanation diagram in the handbook
   but NO app diagram — add build-up diagrams for those (cross-ref handbook list).
3. Diagram reveal-ORDER audit is **complete** (all 110 diagram-bearing units); only
   LGT needed fixing. Visual/scientific correctness audit is **complete** (117/117).
