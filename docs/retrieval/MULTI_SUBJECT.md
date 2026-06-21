# Retrieval-app — multi-subject + objective crosswalk

*How the retrieval side (retrieval-app.com) extends from science-only to any
subject, and connects to the feynman-education mastery graph by objective id.*

> **Why this lives here:** the change spans two repos but **one Supabase anchor
> DB**. The feynman-education repo owns `subjects` / `objectives` /
> `topic_objective_map`; the retrieval-app repo owns `topics` and the weakness
> RPCs. This folder stages the retrieval-side migration + contract so it can be
> applied in that repo. Nothing here is wired into the feynman build.

## The model

```
retrieval topics ──subject_id──▶ subjects   (shared, seeded by feynman)
       │
       └──objective_id──▶ objectives        (shared, canonical "what a pupil should know")
                              ▲
   topic_objective_map (shared crosswalk) ──┘   ← the feynman dashboards read this
```

- **`topics.subject_id`** makes retrieval multi-subject: a topic belongs to a
  subject (Science/Maths/English/…). Existing topics backfill to Science, so the
  current product is unchanged.
- **`topics.objective_id`** (optional) ties a topic to a canonical objective.
  When set, the migration mirrors it into **`topic_objective_map`**, the
  crosswalk the feynman SLT/trust dashboards already consume to blend
  **retrieval + assessment** mastery *by identity* (not by name).

## What to apply (in the retrieval-app repo)

1. Copy `20260621_retrieval_multisubject.sql` into the retrieval-app migration
   set and apply it. It is additive + idempotent:
   - adds `topics.subject_id` (+ index) and backfills Science,
   - adds optional `topics.objective_id`,
   - seeds `topic_objective_map` from any tagged topics.
2. Extend the three weakness RPCs (templates + exact edits are in the SQL):
   - return `subject_id`,
   - accept an **optional** `p_subject text DEFAULT NULL` filter,
   - keep the existing `x-sciencekit-key` gating and marks math unchanged.
   These stay **backward compatible** — the feynman routes that call them today
   keep working without passing the new arg.

## Contract the feynman app relies on (unchanged + additions)

| RPC | Today | After |
|-----|-------|-------|
| `class_weak_topics(p_class_id, p_limit, p_min_marked)` | returns `topic_id, topic_name, pct_correct, marked, students` | **+`subject_id`**, **+optional `p_subject`** |
| `student_weak_topics(p_student_id, p_limit)` | same shape | **+`subject_id`**, **+optional `p_subject`** |
| `class_intervention_list(p_class_id, p_threshold)` | `student_id, student_name, topic_id, topic_name, pct_correct, marked` | **+`subject_id`**, **+optional `p_subject`** |

The feynman side already degrades gracefully if these don't change yet:
- the **crosswalk** (`topic_objective_map`) gives the blend objective ids without
  any RPC change — populate it (manually, by seeding, or via tagged topics) and
  the dashboards immediately join on id;
- `subject_id`/`p_subject` only become necessary when you want **per-subject /
  per-department** dashboard splits (see the “Split by department when
  multi-subject lands” note in `docs/SLT_DASHBOARD.md`).

## Tagging topics to objectives (populating the crosswalk)

Three ways, cheapest first:
1. **Manual / SQL** — `INSERT INTO topic_objective_map (topic_id, objective_id)`.
2. **At authoring time** — set `topics.objective_id` when a topic is created; the
   migration mirrors it into the crosswalk on apply.
3. **AI-assisted** — suggest objective matches for unmapped topics and write rows
   with `source='ai'` + a `confidence`, for human review (P2 content pipeline).

Until a topic is mapped, the blend falls back to **name matching**, so coverage
can grow incrementally with zero regression.
