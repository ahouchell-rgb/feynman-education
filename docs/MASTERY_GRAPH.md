# Mastery graph: the objectives layer (design doc)

**Status:** DRAFT for review. No schema written or applied. Shared anchor DB
(`uvzukwoxqhcxaxtzrziy`) — everything proposed here is additive/idempotent.
**Author:** drafted 2026-06-21 from live-DB introspection + a read of both repos.
**Decisions (locked 2026-06-21):** (1) **lesson-grain** objectives + a `spec_ref`
escape hatch; (2) **lesson + unit-level fallback** so every `topic_map` row maps;
(3) schema owned by **feynman-education** migrations, applied to the anchor;
(4) **global per-subject** (one objectives set per subject, school-agnostic);
(5) ScienceKit (`uujbgdwnuspfnvfpdtvr`) treated as **decommissioned** → single-DB
design. Phase-1 migration: `supabase/migrations/20260621_mastery_graph_objectives.sql`.

---

## 1. Why this doc exists

The product is sold off one data spine: the **per-pupil × per-objective mastery
graph** — blend retrieval-practice weakness with assessment QLA, per objective,
across any subject. The retrieval side has a staged, guarded migration ready
(retrieval-app PR
[#3](https://github.com/ahouchell-rgb/retrieval-app/pull/3)) that adds
`topics.objective_id` + mirrors tagged topics into `topic_objective_map`.

But a live check found the layer those hooks point at **does not exist yet**:

- **Absent on the anchor (and on ScienceKit, and in both repos):** `objectives`,
  `topic_objective_map`, `strands`, `curriculum_specs`, any QLA table.
- **"Objectives" in feynman today = two unrelated things, neither a graph node:**
  (a) `lessons.objectives` free text shown on slides / fed to prompts; (b) a loose
  label in `UnitGaps.tsx` / `sk.tsx` for "weak retrieval topics in a unit."
- The **real** cross-app join today is `unit_id (text) → topic` via `topic_map`,
  consumed by `ret.unitGaps → class_unit_gaps` and `ret.paperGaps → class_paper_gaps`.

So "join by objective id" describes a layer we have to build first. This doc
specifies it.

## 2. What already exists (the ground to build on)

Planning hierarchy on the anchor (all in `public`):

```
groups (id text: y7,y8,gcse_bio,gcse_chem …; label, key_stage, sort_order)
  └─ units (id text: b1_cells,y8_diet …; group_id→groups, discipline, year_group,
            term, paper, + rich content: scheme_of_work, big_idea, misconceptions,
            required_practical …)   — 47 rows, NO subject_id
       └─ lessons (id uuid; unit_id→units; lesson_number, title,
                   objectives TEXT, keywords, starter, afl_checkpoint …)
```

Retrieval spine on the same DB:

```
subjects (id, name, school_id)            — 1 row: 'Science' (no slug, school-scoped)
topics   (id uuid, subject_id NOT NULL→subjects, parent_topic_id, name, key_stage)
                                          — 159 rows, all → Science, indexed
questions(topic_id→topics)  ── retrieval practice, tagged by topic
paper_questions(topic_id→topics) ── exam questions, ALSO tagged by topic
topic_map(retrieval_topic_id→topics, unit_id text→units, lesson_id uuid→lessons,
          unit_code, unit_title, confidence)   — 74 rows
objective_mastery (view): per-class × per-topic mastery from responses, joined to unit
RPCs: class_weak_topics, class_unit_gaps(p_unit_id text), class_paper_gaps
```

**Key insight that shapes the whole design:** retrieval `questions` *and*
`paper_questions` are both tagged by `topic_id`. **Topics are already the shared
spine for both data sources.** So an "objective" is naturally a **curriculum
grouping of topics** that also links to the planning lessons/units — not a third
parallel tagging the markers would have to adopt.

## 3. The grain decision (the one thing to approve first)

What is one "objective" — the atomic node of the graph?

| Option | Objective = | Pros | Cons | 
|---|---|---|---|
| **A · Lesson-grain (recommended)** | one `lessons` row | already exists with `objectives` text + title + unit FK; `topic_map.lesson_id` partially seeds the crosswalk; immediately real | a lesson can span >1 spec point (coarser than exam QLA's atom) |
| B · Spec-point grain | one AQA spec statement (e.g. `4.1.1.1`) | the "true" curriculum atom; aligns 1:1 with exam QLA | the AQA spec isn't in the DB — a real content/import project before anything works |
| C · Unit-grain | one `units` row | trivial (≈ today's `topic_map`) | too coarse to call a "mastery graph"; this is the status quo |

**Recommendation: A (lesson-grain), with a `spec_ref` column so an objective can
carry its AQA code and be split toward B later without a schema change.** It makes
the graph real now (lessons + topics both exist), and the crosswalk is partly
auto-seedable from `topic_map`. We can refine a coarse objective into finer ones
incrementally; the `topic_objective_map (topic_id PK)` contract stays valid because
each topic still rolls up to exactly one objective at a time.

> If you'd rather hold out for true spec-point grain (B), the rest of this doc
> still applies — only §6's backfill changes (import the spec instead of deriving
> from lessons), and the timeline grows by the spec-authoring work.

## 4. Proposed schema (Phase 1 — additive, anchor, feynman-owned)

```sql
-- objectives: the mastery-graph node. Subject-agnostic. Lesson-grain to start.
create table if not exists public.objectives (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id),
  unit_id     text references public.units(id),      -- planning home (nullable)
  lesson_id   uuid references public.lessons(id),    -- finer planning home (nullable)
  code        text,                 -- short human code, e.g. 'B1.2'
  spec_ref    text,                 -- AQA spec point, e.g. '4.1.1.1' (refine-to-B path)
  title       text not null,        -- the learning objective statement
  key_stage   text,                 -- 'KS3'|'KS4' (mirror topics.key_stage)
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_objectives_subject on public.objectives(subject_id);
create index if not exists idx_objectives_unit    on public.objectives(unit_id);

-- topic_objective_map: the crosswalk retrieval-app PR #3 already mirrors into.
-- topic_id PK ⇒ each retrieval topic rolls up to exactly one objective.
create table if not exists public.topic_objective_map (
  topic_id     uuid primary key references public.topics(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  subject_id   uuid references public.subjects(id),
  mapped_by    text not null default 'manual',
  confidence   text not null default 'manual' check (confidence in ('auto','assisted','manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_tom_objective on public.topic_objective_map(objective_id);
```

This exact shape `(topic_id pk, objective_id, subject_id)` is what PR #3's guarded
mirror writes — so the moment this table exists, that mirror activates with zero
further change on the retrieval side.

**Deferred to a later phase (not needed for the first blended dashboard):**
`strands` and `curriculum_specs` (higher taxonomy above objectives) and a formal
`assessment_qla` table. Topics already give enough grouping for v1; add the upper
taxonomy when a second subject or a formal spec import needs it.

**RLS (mirror `topic_map` exactly — curriculum is non-sensitive read, elevated
write):**
```sql
alter table public.objectives          enable row level security;
alter table public.topic_objective_map enable row level security;
create policy objectives_read  on public.objectives          for select to authenticated using (true);
create policy tom_read         on public.topic_objective_map for select to authenticated using (true);
grant select on public.objectives, public.topic_objective_map to authenticated;
-- no write policy ⇒ writes are service-role / migration only (same as topic_map)
```

## 5. How retrieval wires in (already built, just dormant)

PR #3 (retrieval-app) is the retrieval half and needs **no change** once §4 lands:

- `topics.objective_id` column — already added (nullable).
- The `objectives` FK on `topics.objective_id` — added by PR #3's guarded block the
  next time it runs after `objectives` exists.
- The mirror into `topic_objective_map` — PR #3's guarded upsert fires.
- `class_weak_topics` / `student_weak_topics` / `class_intervention_list` already
  return `subject_id` and take `p_subject`.

Re-running PR #3's migration is idempotent, so the activation step is just "apply
§4, then re-apply `20260621_01`."

## 6. Backfill (seed objectives + the crosswalk from what exists)

Lesson-grain (Option A), all idempotent, all derivable from current data:

1. **Objectives from lessons** — one objective per lesson, inheriting its unit and
   title; subject = Science (the only subject today):
   ```sql
   insert into public.objectives (subject_id, unit_id, lesson_id, title, key_stage, sort_order)
   select s.id, l.unit_id, l.id, coalesce(nullif(l.title,''), 'Lesson '||l.lesson_number),
          u_keystage(l.unit_id), l.sort_order
   from public.lessons l
   join public.subjects s on s.name='Science'
   on conflict do nothing;   -- guard via a unique (lesson_id) once chosen
   ```
   (For units with **no** lessons yet, optionally also create one unit-level
   objective so every mapped topic has a home — decision in §8.)

2. **topic_objective_map from `topic_map`** — reuse the existing topic→lesson/unit
   crosswalk: a topic mapped to a lesson → that lesson's objective; else a topic
   mapped to a unit → that unit's (unit-level) objective:
   ```sql
   insert into public.topic_objective_map (topic_id, objective_id, subject_id, mapped_by, confidence)
   select tm.retrieval_topic_id, o.id, t.subject_id, 'auto:from_topic_map', 'auto'
   from public.topic_map tm
   join public.topics t on t.id = tm.retrieval_topic_id
   join public.objectives o
     on (tm.lesson_id is not null and o.lesson_id = tm.lesson_id)
     or (tm.lesson_id is null     and o.unit_id   = tm.unit_id and o.lesson_id is null)
   on conflict (topic_id) do update set objective_id = excluded.objective_id;
   ```
   74 `topic_map` rows seed the crosswalk immediately; the remaining topics get
   tagged as content matures (or via an assisted pass, like the KS3 unit mapping).

3. **`topics.objective_id`** then follows the crosswalk (optional convenience copy):
   ```sql
   update public.topics t set objective_id = m.objective_id
   from public.topic_objective_map m where m.topic_id = t.id and t.objective_id is distinct from m.objective_id;
   ```

## 7. Dashboard changes (feynman side — join by objective, fall back to topic)

The blend is the payoff. Two consumers change, both backward-compatible:

- **`src/lib/sk.tsx` (`ret.*`)** — today `unitGaps` calls `class_unit_gaps(unit_id)`
  and merges by `topic_id`. Add an objective-aware path that groups the same RPC
  rows by `objective_id` when the crosswalk has one, else by topic name. No new RPC
  is strictly required for v1 because the rows already carry `topic_id` and (after
  §4) we can join `topic_objective_map` client-side or expose `objective_id` from
  the view. Cleanest: add `objective_id`/`objective_title` to the
  `objective_mastery` view (additive column) so the existing RPCs surface it.
- **`UnitGaps.tsx`** — group the gap list by objective (heading = objective title),
  topics nested under it; "weakest objective" becomes literally true. Falls back to
  the current flat topic list when no objective mapping exists (so nothing regresses
  for unmapped content).
- **Assessment QLA blend** — once a QLA source exists (paper marking already writes
  `paper_responses` tagged by `paper_questions.topic_id`), a per-objective view
  unions retrieval `responses` + `paper_responses` grouped via
  `topic_objective_map`. This is the "one number per objective per pupil" that the
  parent/school/MAT dashboards read. Specify as Phase 2.

## 8. Open decisions / needs-your-call

1. **Grain:** approve A (lesson-grain + `spec_ref`) vs hold for B (spec-point).
2. **Unmapped-topic home:** create unit-level objectives so every `topic_map` row
   maps, or leave topics mapped only to lessons (cleaner graph, fewer rows, but some
   topics unmapped until lessons exist)?
3. **Ownership/repo:** objectives schema is curriculum → lives in
   **feynman-education** migrations (its `supabase/migrations/`), applied to the
   anchor. Confirm that's where you want the migration (vs retrieval-app's
   `db/migrations/`, which currently owns `topics`/`topic_map`).
4. **Multi-tenant:** `subjects` is school-scoped (one Science row). Objectives are
   subject-scoped; if/when a second school brings its own subjects, decide whether
   objectives are global-per-subject or per-school.
5. **Cross-DB ghost:** ScienceKit project (`uujbgdwnuspfnvfpdtvr`) still exists with
   only `units`. Confirm it's decommissioned for this purpose so we don't design a
   cross-DB mirror.

## 9. Phasing

- **Phase 0 (done):** retrieval-app PR #3 — subject-agnostic RPCs + dormant guarded
  hooks.
- **Phase 1 (this doc, ~1 migration + backfill):** `objectives` + `topic_objective_map`
  on the anchor; backfill from lessons + `topic_map`; re-apply PR #3 to activate.
  Add `objective_id`/`objective_title` to `objective_mastery` (additive).
- **Phase 2:** feynman dashboards group by objective (sk.tsx + UnitGaps), topic-name
  fallback. Per-objective blended view unioning retrieval + paper responses.
- **Phase 3:** upper taxonomy (`strands`/`curriculum_specs`), formal QLA table, the
  refine-to-spec-point pass; second subject (e.g. Maths) end-to-end.

## 10. Risks / guardrails

- Shared prod DB → every migration additive + idempotent, RLS mirrors `topic_map`
  (read-to-authenticated, write elevated-only), no widening of existing policies.
- `units.id`/`groups.id` are **text** slugs; `objectives.unit_id` must be `text`,
  not uuid (easy to get wrong).
- Don't let `objectives` writes become client-writable (no write policy = safe).
- Backfill is re-runnable; guard objective creation with a unique key (e.g.
  `unique(lesson_id)`) so re-running doesn't duplicate nodes.
```
