-- STATUS: NOT APPLIED. Branch feat/retrieval-multisubject-objective-wiring. Target project
-- uvzukwoxqhcxaxtzrziy (the shared anchor). Additive + idempotent throughout;
-- safe to replay. Apply with:  psql "$DATABASE_URL" -f db/migrations/20260621_01_topics_objective_id_and_subject_rpcs.sql
--
-- PURPOSE
--   Make the retrieval side subject-agnostic and ready to wire to the mastery
--   graph by objective id, WITHOUT depending on platform tables that are not yet
--   on this database.
--
-- WHAT WAS VERIFIED LIVE ON THE ANCHOR (2026-06-21, read-only) — drives the choices below:
--   * public.topics ALREADY has subject_id uuid NOT NULL (FK → public.subjects.id),
--     ALREADY indexed (idx_topics_subject), and all 159 topics already point at the
--     single subject row 'Science'. So the "topics gains subject_id + backfill + index"
--     ask is effectively already satisfied; the statements in §1 are idempotent no-ops
--     on the anchor and exist only for fresh-DB replay.
--   * public.subjects has columns (id, name, school_id, created_at) — there is NO `slug`
--     column. The lone subject is matched by name = 'Science'. The p_subject RPC filter
--     therefore matches on subjects.name (not a slug).
--   * The mastery-graph platform tables (objectives, topic_objective_map, strands,
--     curriculum_specs) DO NOT EXIST on this DB (nor on the ScienceKit project, nor in
--     either repo). So §2's objectives FK and §3's crosswalk mirror are GUARDED behind
--     to_regclass() existence checks: the column lands now, and the FK + mirror activate
--     automatically once the platform schema is deployed. Nothing here references a
--     table that does not exist at apply time.
--   * Of the three "weakness RPCs", only class_weak_topics exists. The LIVE body has a
--     broader gate than any committed migration (x-sciencekit-key OR is_moderator() OR
--     teacher-of-class OR HoD) — applied out-of-band during the Phase-3 repoint. §4
--     reproduces that gate verbatim so a fresh-DB replay matches prod and prod is not
--     regressed. student_weak_topics and class_intervention_list are NET-NEW (no route
--     calls them today), created to the documented contract in §5/§6.
--
-- BACKWARD COMPATIBILITY
--   class_weak_topics adds two trailing-defaulted params (p_min_marked already existed;
--   p_subject is new) and an extra output column (subject_id). The half-term-feedforward
--   cron calls it by name as {p_class_id, p_limit}; that resolves uniquely to the single
--   new 4-arg overload, and the added subject_id column is ignored by the consumer. The
--   old 3-arg overload is dropped (a return-type change cannot be done via CREATE OR
--   REPLACE, and keeping both overloads would make the named call ambiguous).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  topics.subject_id  (already present on the anchor; idempotent replay safety)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.topics
  add column if not exists subject_id uuid references public.subjects(id);

-- Backfill any unassigned topic to the single 'Science' subject. No-op on the anchor
-- (subject_id is already NOT NULL there); meaningful only on a fresh/partial replay,
-- and only when exactly one subject named 'Science' exists (otherwise leaves nulls
-- for a human to resolve rather than guessing).
do $$
declare v_science uuid;
begin
  if exists (select 1 from public.topics where subject_id is null) then
    select id into v_science
      from public.subjects
     where lower(name) = 'science'
     order by created_at
     limit 1;
    if v_science is not null then
      update public.topics set subject_id = v_science where subject_id is null;
      raise notice '[multisubject] backfilled topics.subject_id → Science for unassigned rows.';
    else
      raise notice '[multisubject] some topics have null subject_id but no ''Science'' subject was found; left for manual resolution.';
    end if;
  end if;
end $$;

create index if not exists idx_topics_subject on public.topics(subject_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  topics.objective_id  (column unconditional; FK guarded on objectives existing)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.topics
  add column if not exists objective_id uuid;

comment on column public.topics.objective_id is
  'Optional link to the mastery-graph objective for this retrieval topic. FK to public.objectives(id) is added by this migration only once that table exists on the DB.';

do $$
begin
  if to_regclass('public.objectives') is null then
    raise notice '[multisubject] objectives table absent; topics.objective_id added without FK (the FK becomes addable once objectives lands).';
  elsif not exists (
      select 1 from pg_constraint
       where conrelid = 'public.topics'::regclass
         and conname  = 'topics_objective_id_fkey')
  then
    alter table public.topics
      add constraint topics_objective_id_fkey
      foreign key (objective_id) references public.objectives(id);
    raise notice '[multisubject] added FK topics.objective_id → objectives(id).';
  end if;
end $$;

create index if not exists idx_topics_objective
  on public.topics(objective_id) where objective_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Mirror tagged topics into the shared crosswalk  (guarded; self-activating)
--     Assumes topic_objective_map(topic_id pk/unique, objective_id, subject_id) per the
--     feynman contract. Guarded by table existence and a non-fatal EXCEPTION block so a
--     shape mismatch logs a NOTICE instead of aborting the migration. Re-run this file
--     after the platform schema lands (or after tagging more topics) to re-sync.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.topic_objective_map') is null then
    raise notice '[multisubject] topic_objective_map absent; objective crosswalk mirror skipped (activates once the platform schema lands).';
  else
    begin
      insert into public.topic_objective_map (topic_id, objective_id, subject_id)
      select t.id, t.objective_id, t.subject_id
        from public.topics t
       where t.objective_id is not null
      on conflict (topic_id) do update
        set objective_id = excluded.objective_id,
            subject_id   = excluded.subject_id;
      raise notice '[multisubject] mirrored % tagged topic(s) into topic_objective_map.',
        (select count(*) from public.topics where objective_id is not null);
    exception when others then
      raise notice '[multisubject] topic_objective_map present but mirror failed (shape mismatch?): %. Skipped, non-fatal.', sqlerrm;
    end;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4  class_weak_topics  — add subject_id output + optional p_subject filter.
--     Body/gate reproduced verbatim from the LIVE definition (Phase-3 expanded gate);
--     marks math (om.pct_correct / om.marked / om.students) is unchanged. subject_id is
--     sourced by joining topics; p_subject filters on subjects.name (no slug exists).
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.class_weak_topics(uuid, int, int);

create or replace function public.class_weak_topics(
  p_class_id uuid, p_limit int default 5, p_min_marked int default 8, p_subject text default null)
returns table(topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked int, students int)
language sql
security definer
set search_path = public
as $$
  select om.topic_id, om.topic_name, t.subject_id, om.pct_correct, om.marked::int, om.students::int
  from public.objective_mastery om
  join public.topics t on t.id = om.topic_id
  left join public.subjects s on s.id = t.subject_id
  where om.class_id = p_class_id
    and om.marked >= p_min_marked
    and (p_subject is null or s.name = p_subject)
    and (
      nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
          = (select value from private.app_config where key = 'sciencekit_key')
      or public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  order by om.pct_correct asc, om.marked desc
  limit p_limit;
$$;

comment on function public.class_weak_topics(uuid, int, int, text) is
  'A class''s weakest retrieval topics (aggregate, non-personal). Optional p_subject (subjects.name) splits by subject/department; subject_id is returned. Gate: x-sciencekit-key OR moderator OR teacher-of-class OR HoD.';

grant execute on function public.class_weak_topics(uuid, int, int, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5  student_weak_topics  — NET-NEW. One pupil's weakest topics. Per-pupil data, so
--     gated like class_weak_topics but on the pupil's relationship to the caller
--     (server secret OR moderator OR a teacher who has the pupil in a class OR that
--     teacher's HoD). Same is_correct-based marks math as objective_mastery.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.student_weak_topics(
  p_student_id uuid, p_limit int default 5, p_subject text default null)
returns table(topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name, t.subject_id,
         round(100.0 * count(*) filter (where r.is_correct)
               / nullif(count(*) filter (where r.is_correct is not null), 0), 0) as pct_correct,
         count(*) filter (where r.is_correct is not null)::int as marked
  from public.responses r
  join public.questions q on q.id = r.question_id
  join public.topics    t on t.id = q.topic_id
  left join public.subjects s on s.id = t.subject_id
  where r.student_id = p_student_id
    and (p_subject is null or s.name = p_subject)
    and (
      nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
          = (select value from private.app_config where key = 'sciencekit_key')
      or public.is_moderator()
      or exists (select 1 from public.responses r2 join public.classes c on c.id = r2.class_id
                 where r2.student_id = p_student_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.responses r3 join public.classes c on c.id = r3.class_id
                 join public.profiles tp on tp.id = c.teacher_id
                 where r3.student_id = p_student_id and tp.hod_id = auth.uid())
    )
  group by t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
  order by pct_correct asc, marked desc
  limit p_limit;
$$;

comment on function public.student_weak_topics(uuid, int, text) is
  'One pupil''s weakest retrieval topics (per-pupil). Optional p_subject (subjects.name) split; subject_id returned. Gate: x-sciencekit-key OR moderator OR a teacher who has the pupil in a class OR that teacher''s HoD.';

grant execute on function public.student_weak_topics(uuid, int, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §6  class_intervention_list  — NET-NEW. Pupils × topics in one class below a % cutoff
--     (the "intervene here" list). Identity-gated on the class (server secret OR
--     moderator OR teacher-of-class OR HoD). student_name from profiles (students are
--     profile rows; FK responses.student_id → profiles.id).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.class_intervention_list(
  p_class_id uuid, p_threshold int default 50, p_subject text default null)
returns table(student_id uuid, student_name text, topic_id uuid, topic_name text,
              subject_id uuid, pct_correct numeric, marked int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.student_id,
         coalesce(p.display_name, p.full_name, 'Pupil') as student_name,
         t.id, t.name, t.subject_id,
         round(100.0 * count(*) filter (where r.is_correct)
               / nullif(count(*) filter (where r.is_correct is not null), 0), 0) as pct_correct,
         count(*) filter (where r.is_correct is not null)::int as marked
  from public.responses r
  join public.questions q on q.id = r.question_id
  join public.topics    t on t.id = q.topic_id
  join public.profiles  p on p.id = r.student_id
  left join public.subjects s on s.id = t.subject_id
  where r.class_id = p_class_id
    and (p_subject is null or s.name = p_subject)
    and (
      nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
          = (select value from private.app_config where key = 'sciencekit_key')
      or public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  group by r.student_id, coalesce(p.display_name, p.full_name, 'Pupil'), t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
     and round(100.0 * count(*) filter (where r.is_correct)
               / nullif(count(*) filter (where r.is_correct is not null), 0), 0) <= p_threshold
  order by pct_correct asc, marked desc;
$$;

comment on function public.class_intervention_list(uuid, int, text) is
  'Pupils × topics in one class scoring at/below p_threshold percent (default 50) — the intervention list. Optional p_subject (subjects.name) split; subject_id returned. Gate: x-sciencekit-key OR moderator OR teacher-of-class OR HoD.';

grant execute on function public.class_intervention_list(uuid, int, text) to anon, authenticated;

commit;
