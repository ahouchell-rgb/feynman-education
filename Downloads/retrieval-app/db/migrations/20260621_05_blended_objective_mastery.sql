-- STATUS: NOT APPLIED. Branch feat/blended-objective-mastery. Target project
-- uvzukwoxqhcxaxtzrziy (shared anchor). Additive + idempotent. Phase 2 (blend) of the
-- mastery graph: the per-pupil × per-objective mastery node, blending retrieval
-- practice with past-paper exam marks into ONE number per objective.
--
-- BLEND MODEL — one unified mark scale: each RETRIEVAL question counts as 1 mark
-- (awarded 1 if is_correct, 0 if marked-incorrect; unmarked rows excluded); each
-- PAPER question counts as its marks (marks_awarded / marks_max). Blended pct =
-- Σawarded / Σmax across BOTH sources (mark-weighted union — a 6-mark exam item
-- counts 6× a 1-mark recall item, which is the intended weighting). retrieval_pct /
-- paper_pct are also exposed so a dashboard can show the split, and a pupil/objective
-- with only one source blends to just that source.
--
--   §1  pupil_objective_mastery  — VIEW, security_invoker (RLS-respecting), grain
--       (class_id, student_id, objective_id). The canonical per-pupil × per-objective
--       node for pupil profiles / parent / school / MAT dashboards.
--   §2  class_objective_breakdown(p_class_id [, p_unit_id] [, p_limit]) — RPC, the
--       class rollup (per objective, blended + split), identity-gated + x-sciencekit-key
--       secret so the feynman planner (anon key + secret) can read it. Non-personal
--       aggregate (per-objective class %, pupil COUNT only — no pupil identities).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  pupil_objective_mastery  (per class × pupil × objective; blended)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.pupil_objective_mastery
with (security_invoker = true) as
with unified as (
  -- retrieval practice: 1 mark per marked question
  select r.class_id, r.student_id, tom.objective_id, tom.subject_id,
         (r.is_correct)::int            as awarded,
         1                              as max_marks,
         'retrieval'::text              as source,
         r.answered_at::date            as seen
  from public.responses r
  join public.questions q             on q.id = r.question_id
  join public.topic_objective_map tom on tom.topic_id = q.topic_id
  where r.is_correct is not null
  union all
  -- past-paper exam: the question's marks
  select a.class_id, a.student_id, tom.objective_id, tom.subject_id,
         coalesce(pr.marks_awarded, 0)  as awarded,
         coalesce(pr.marks_max, 0)      as max_marks,
         'paper'::text                  as source,
         a.submitted_at::date           as seen
  from public.paper_responses pr
  join public.paper_attempts   a  on a.id  = pr.attempt_id
  join public.paper_questions  pq on pq.id = pr.paper_question_id
  join public.topic_objective_map tom on tom.topic_id = pq.topic_id
  where a.submitted_at is not null
)
select
  u.class_id, u.student_id, u.objective_id, u.subject_id,
  o.title                                                                  as objective_title,
  sum(u.awarded)   filter (where u.source = 'retrieval')::int              as retrieval_awarded,
  sum(u.max_marks) filter (where u.source = 'retrieval')::int              as retrieval_max,
  sum(u.awarded)   filter (where u.source = 'paper')::int                  as paper_awarded,
  sum(u.max_marks) filter (where u.source = 'paper')::int                  as paper_max,
  sum(u.awarded)::int                                                      as awarded,
  sum(u.max_marks)::int                                                    as max_marks,
  round(100.0 * sum(u.awarded) / nullif(sum(u.max_marks), 0), 0)           as pct,
  round(100.0 * sum(u.awarded) filter (where u.source = 'retrieval')
        / nullif(sum(u.max_marks) filter (where u.source = 'retrieval'), 0), 0) as retrieval_pct,
  round(100.0 * sum(u.awarded) filter (where u.source = 'paper')
        / nullif(sum(u.max_marks) filter (where u.source = 'paper'), 0), 0)     as paper_pct,
  max(u.seen)                                                              as last_seen
from unified u
left join public.objectives o on o.id = u.objective_id
group by u.class_id, u.student_id, u.objective_id, u.subject_id, o.title;

comment on view public.pupil_objective_mastery is
  'Per pupil × per objective mastery, blending retrieval practice (1 mark/question) with past-paper exam marks into a single % (mark-weighted union) plus the retrieval/paper split. RLS-respecting (security_invoker): a teacher sees their classes'' pupils, a pupil sees self. The mastery-graph''s per-pupil node.';

grant select on public.pupil_objective_mastery to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  class_objective_breakdown  (class rollup per objective; blended + split)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.class_objective_breakdown(
  p_class_id uuid, p_unit_id text default null, p_limit int default 50)
returns table(
  objective_id uuid, objective_title text,
  pct numeric, retrieval_pct numeric, paper_pct numeric,
  marks int, pupils int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with unified as (
    select r.student_id, tom.objective_id, (r.is_correct)::int as awarded, 1 as mx, 'r'::text as src
    from public.responses r
    join public.questions q             on q.id = r.question_id
    join public.topic_objective_map tom on tom.topic_id = q.topic_id
    where r.class_id = p_class_id and r.is_correct is not null
    union all
    select a.student_id, tom.objective_id, coalesce(pr.marks_awarded,0), coalesce(pr.marks_max,0), 'p'
    from public.paper_responses pr
    join public.paper_attempts   a  on a.id  = pr.attempt_id
    join public.paper_questions  pq on pq.id = pr.paper_question_id
    join public.topic_objective_map tom on tom.topic_id = pq.topic_id
    where a.class_id = p_class_id and a.submitted_at is not null
  )
  select u.objective_id, o.title,
         round(100.0 * sum(u.awarded) / nullif(sum(u.mx), 0), 0)                                   as pct,
         round(100.0 * sum(u.awarded) filter (where u.src='r') / nullif(sum(u.mx) filter (where u.src='r'),0),0) as retrieval_pct,
         round(100.0 * sum(u.awarded) filter (where u.src='p') / nullif(sum(u.mx) filter (where u.src='p'),0),0) as paper_pct,
         sum(u.mx)::int                                                                            as marks,
         count(distinct u.student_id)::int                                                         as pupils
  from unified u
  join public.objectives o on o.id = u.objective_id
  where (p_unit_id is null or o.unit_id = p_unit_id)
    and (
      nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
          = (select value from private.app_config where key = 'sciencekit_key')
      or public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  group by u.objective_id, o.title
  having sum(u.mx) > 0
  order by pct asc nulls last, marks desc
  limit p_limit;
$$;

comment on function public.class_objective_breakdown(uuid, text, int) is
  'A class''s blended mastery per objective (retrieval + past-paper, mark-weighted), with the retrieval/paper split and pupil count. Optional p_unit_id scopes to one unit''s objectives. Aggregate, non-personal. Gate: x-sciencekit-key OR moderator OR teacher-of-class OR HoD.';

grant execute on function public.class_objective_breakdown(uuid, text, int) to anon, authenticated;

commit;
