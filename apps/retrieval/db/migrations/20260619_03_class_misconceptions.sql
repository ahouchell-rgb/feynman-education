-- Misconception mining — turn a class's WRONG retrieval answers into named,
-- SPECIFIC misconceptions for the teacher (the "close the loop" step: retrieval
-- marking data -> actionable teaching insight -> reteach). The AI clustering runs
-- in the `class-misconceptions` edge function; this migration supplies the read
-- surface it feeds the model, plus a cache so re-opening the panel doesn't re-bill.
--
-- Builds on objective_mastery / class_weak_objectives (20260615_02), which give
-- weak TOPICS by % correct. The new bit is the per-question wrong-answer rollup —
-- the actual pupil text — and naming the faulty idea behind it.

-- ── 1. Per-question wrong-answer rollup (the model's input) ───────────────────
-- SECURITY INVOKER: a teacher calling this directly only sees their own classes'
-- responses (the existing RLS on `responses` applies). The edge function calls it
-- with the service-role key (bypasses RLS) AFTER it has checked class tenancy.
-- No pupil identifiers are returned — only the answer text and aggregate counts.
create or replace function public.class_misconception_inputs(
  p_class_id uuid,
  p_days     int  default 28,
  p_topic_id uuid default null
)
returns table (
  topic_id      uuid,
  topic_name    text,
  question_id   uuid,
  question_text text,
  model_answer  text,
  marks         int,
  wrong_pupils  int,
  wrong_total   int,
  sample_wrong  text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.topic_id,
    t.name as topic_name,
    r.question_id,
    q.question_text,
    q.model_answer,
    q.marks,
    count(distinct r.student_id)::int                       as wrong_pupils,
    count(*)::int                                           as wrong_total,
    (array_agg(distinct left(r.student_answer, 200)))[1:8]  as sample_wrong
  from public.responses r
  join public.questions q on q.id = r.question_id
  join public.topics    t on t.id = q.topic_id
  where r.class_id = p_class_id
    and r.is_correct = false
    and coalesce(r.student_answer, '') <> ''
    and coalesce(r.ai_feedback, '') not like 'FLAGGED:%'             -- drop non-attempts / junk
    and r.answered_at >= now() - make_interval(days => greatest(p_days, 1))
    and (p_topic_id is null or q.topic_id = p_topic_id)
  group by q.topic_id, t.name, r.question_id, q.question_text, q.model_answer, q.marks
  having count(*) >= 2                                                -- a real pattern, not a one-off slip
  order by count(distinct r.student_id) desc, count(*) desc
$$;

grant execute on function public.class_misconception_inputs(uuid, int, uuid) to authenticated, service_role;

comment on function public.class_misconception_inputs(uuid, int, uuid) is
  'Per-question rollup of a class''s WRONG answers (text samples + pupil counts) for the misconception miner. RLS-respecting (security invoker); no pupil identifiers returned.';

-- ── 2. Cached mining results (so the panel is cheap to re-open) ───────────────
create table if not exists public.class_misconception_runs (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  topic_id      uuid references public.topics(id) on delete cascade,
  days          int  not null default 28,
  result        jsonb not null,            -- { misconceptions: [ ... ] }
  model         text,
  input_tokens  int,
  output_tokens int,
  computed_by   uuid references public.profiles(id),
  computed_at   timestamptz not null default now()
);

create index if not exists class_misconception_runs_class_idx
  on public.class_misconception_runs (class_id, computed_at desc);

alter table public.class_misconception_runs enable row level security;

-- Teachers read runs for their OWN classes; moderators/admins read all.
-- There is deliberately NO insert/update/delete policy for `authenticated`:
-- only the edge function (service-role, bypasses RLS) writes runs.
drop policy if exists cmr_select on public.class_misconception_runs;
create policy cmr_select on public.class_misconception_runs
  for select to authenticated
  using (
    exists (select 1 from public.classes c
            where c.id = class_misconception_runs.class_id
              and c.teacher_id = auth.uid())
    or exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('moderator', 'admin'))
  );

grant select on public.class_misconception_runs to authenticated;

comment on table public.class_misconception_runs is
  'Cached output of the class-misconceptions edge function, one row per mining run. Read by the teacher panel; written only by the edge function (service-role).';
