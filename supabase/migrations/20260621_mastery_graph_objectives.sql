-- Mastery graph — Phase 1: the objectives layer.
-- See docs/MASTERY_GRAPH.md. Target: the shared anchor (uvzukwoxqhcxaxtzrziy).
-- STATUS: NOT APPLIED — draft for review. Additive + idempotent; safe to replay.
--
-- Locked decisions (2026-06-21): lesson-grain objectives (+ spec_ref escape hatch),
-- with a unit-level fallback objective per unit so every topic_map row has a home;
-- schema owned here (feynman) but applied to the anchor; global per-subject (one
-- objectives set per subject, school-agnostic); single-DB (ScienceKit decommissioned).
--
-- Why "objective = a grouping of topics": retrieval `questions` AND exam
-- `paper_questions` are both tagged by topic_id, so topics are already the shared
-- spine. An objective groups topics and links them to the planning lesson/unit; the
-- crosswalk `topic_objective_map (topic_id PK)` is the exact shape retrieval-app PR
-- #3's guarded mirror writes, so that mirror self-activates once this table exists.
--
-- NOTE: types — units.id and groups.id are TEXT slugs (b1_cells, y8, …), lessons.id
-- is uuid. objectives.unit_id MUST be text, lesson_id uuid.

-- ─────────────────────────────────────────────────────────────────────────────
-- objectives: the mastery-graph node (lesson-grain; unit-level rows are fallbacks)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.objectives (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id),
  unit_id     text references public.units(id)   on delete cascade,
  lesson_id   uuid references public.lessons(id) on delete cascade,
  code        text,                 -- short human code, e.g. 'B1.2' (optional)
  spec_ref    text,                 -- AQA spec point, e.g. '4.1.1.1' (refine-to-spec-grain path)
  title       text not null,        -- the learning-objective statement
  key_stage   text,                 -- 'KS3' | 'KS4' (from the unit's group)
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.objectives is
  'Mastery-graph node: a curriculum objective (lesson-grain; rows with lesson_id null are unit-level fallbacks). Subject-scoped, school-agnostic. Non-personal taxonomy.';

-- One objective per lesson, and at most one unit-level (fallback) objective per unit.
-- Partial unique indexes ⇒ the backfill upserts are idempotent.
create unique index if not exists uq_objectives_lesson
  on public.objectives(lesson_id) where lesson_id is not null;
create unique index if not exists uq_objectives_unit_fallback
  on public.objectives(unit_id) where lesson_id is null;
create index if not exists idx_objectives_subject on public.objectives(subject_id);
create index if not exists idx_objectives_unit    on public.objectives(unit_id);

alter table public.objectives enable row level security;
drop policy if exists objectives_read on public.objectives;
create policy objectives_read on public.objectives for select to authenticated using (true);
grant select on public.objectives to authenticated;
-- no write policy ⇒ writes are service-role / migration only (same as topic_map/resource_map)

-- ─────────────────────────────────────────────────────────────────────────────
-- topic_objective_map: retrieval topic → objective (the shared crosswalk).
-- topic_id PK ⇒ each topic rolls up to exactly one objective. Exactly the shape
-- retrieval-app PR #3's guarded mirror inserts (topic_id, objective_id, subject_id).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.topic_objective_map (
  topic_id     uuid primary key references public.topics(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  subject_id   uuid references public.subjects(id),
  mapped_by    text not null default 'manual',
  confidence   text not null default 'manual'
               check (confidence in ('auto','assisted','manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_tom_objective on public.topic_objective_map(objective_id);

comment on table public.topic_objective_map is
  'Crosswalk: retrieval topic → mastery-graph objective (topic_id PK = one objective per topic). Read by the feynman dashboards to blend retrieval + QLA per objective.';

alter table public.topic_objective_map enable row level security;
drop policy if exists tom_read on public.topic_objective_map;
create policy tom_read on public.topic_objective_map for select to authenticated using (true);
grant select on public.topic_objective_map to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill — derive objectives + the crosswalk from existing planning data.
-- All idempotent (ON CONFLICT). Guarded on the 'Science' subject existing.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_subject uuid;
begin
  select id into v_subject
    from public.subjects where lower(name) = 'science'
    order by created_at limit 1;
  if v_subject is null then
    raise notice '[mastery-graph] no ''Science'' subject found — backfill skipped (schema still created).';
    return;
  end if;

  -- 1) lesson-level objectives — one per lesson, inheriting unit, title, key_stage
  insert into public.objectives (subject_id, unit_id, lesson_id, title, key_stage, sort_order)
  select v_subject, l.unit_id, l.id,
         coalesce(nullif(btrim(l.title), ''), 'Lesson ' || l.lesson_number::text),
         g.key_stage, coalesce(l.sort_order, 0)
  from public.lessons l
  left join public.units  u on u.id = l.unit_id
  left join public.groups g on g.id = u.group_id
  on conflict (lesson_id) where lesson_id is not null do nothing;

  -- 2) unit-level fallback objectives — one per unit (home for topics not yet at lesson grain)
  insert into public.objectives (subject_id, unit_id, lesson_id, title, key_stage, sort_order)
  select v_subject, u.id, null, u.title, g.key_stage, coalesce(u.sort_order, 0)
  from public.units u
  left join public.groups g on g.id = u.group_id
  on conflict (unit_id) where lesson_id is null do nothing;

  -- 3) crosswalk from topic_map — topic→lesson objective if mapped to a lesson, else unit fallback
  insert into public.topic_objective_map (topic_id, objective_id, subject_id, mapped_by, confidence)
  select tm.retrieval_topic_id, o.id, t.subject_id, 'auto:from_topic_map', 'auto'
  from public.topic_map tm
  join public.topics t on t.id = tm.retrieval_topic_id
  join public.objectives o
    on (tm.lesson_id is not null and o.lesson_id = tm.lesson_id)
    or (tm.lesson_id is null     and o.unit_id  = tm.unit_id and o.lesson_id is null)
  on conflict (topic_id) do update
    set objective_id = excluded.objective_id,
        subject_id   = excluded.subject_id,
        updated_at   = now();

  raise notice '[mastery-graph] backfilled % objectives, % topic→objective rows.',
    (select count(*) from public.objectives),
    (select count(*) from public.topic_objective_map);
end $$;

-- 4) keep retrieval's convenience column in sync IF it exists (retrieval-app PR #3).
--    Guarded so this migration is order-independent w.r.t. that PR.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='topics' and column_name='objective_id') then
    update public.topics t
       set objective_id = m.objective_id
      from public.topic_objective_map m
     where m.topic_id = t.id
       and t.objective_id is distinct from m.objective_id;
    raise notice '[mastery-graph] synced topics.objective_id from the crosswalk.';
  else
    raise notice '[mastery-graph] topics.objective_id absent (retrieval PR #3 not applied yet) — skipped; PR #3 mirrors it later.';
  end if;
end $$;
