# Subject rewire (NOW plan · T6.2 / T6.3)

Builds on the subject foundation (T6.1) to make the engine genuinely multi-subject —
so a Maths or English unit produces Maths/English material, not science-flavoured output.

## T6.3 — subject-aware AI generators (shipped)

`src/lib/subject.ts` resolves a unit's subject from the embedded `subject:subjects(name,slug)`
(added by T6.1), falling back to the legacy science `discipline`, then "Science" — so
**existing science content is unchanged**. The generators now read the unit's subject:

- **Lesson generator** — "Build a … `${subject}` lesson deck …".
- **Feedforward** — "… FEEDFORWARD practice sheet for a UK secondary `${subject}` class …" (both the gaps and the exam/paper-upload prompts).
- **Revision pack** — booklet subject taken from the unit; SYSTEM no longer hard-codes "science".
- **Required-practical / task** — science units get a practical + risk assessment; non-science units get a "required task / activity" sheet in the same structure (apparatus → materials; risk assessment → wellbeing notes).
- **Cover script** — deck-based, so the prompt now infers the subject from the slides instead of assuming science.

## T6.2 — UI theming (graceful fallback now; full pass later)

Science still renders via the existing `DISC` (biology/chemistry/physics) map; a non-science
unit (no `discipline`) falls back to the neutral "combined" accent, so nothing breaks. A full
pass — driving labels/colours from the subject config and a subject filter on curriculum —
lands once real non-science (Maths/English) content exists to render, so there's something to
see. Tracked as the remaining T6.2 work.

## Net effect

Adding a subject is now **data + content review** (E7), not a code fork: seed a subject
(done for Maths/English in T6.1), attach units, and the whole generator toolkit works in that
subject. `next build` + 25 tests pass; all changes additive.
