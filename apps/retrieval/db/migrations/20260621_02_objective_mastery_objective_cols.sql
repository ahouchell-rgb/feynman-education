-- STATUS: APPLIED to uvzukwoxqhcxaxtzrziy on 2026-06-21. Verified: objective_mastery
-- view carries objective_id/objective_title; class_unit_gaps returns them. Branch
-- feat/retrieval-multisubject-objective-wiring. Additive + idempotent. Phase 2 of the
-- mastery-graph wiring (the feynman dashboards group by objective).
--
-- Surfaces the mastery-graph OBJECTIVE on the per-class×per-topic mastery path so the
-- planning dashboards can group gaps by objective (objective title heading, topics
-- nested), falling back to topic when a topic isn't mapped yet.
--
--   §1  objective_mastery view  += objective_id, objective_title  (LEFT JOINs to the
--       topic_objective_map crosswalk + objectives; appended at the END of the column
--       list so CREATE OR REPLACE is legal and existing consumers are unaffected).
--   §2  class_unit_gaps RPC      += objective_id, objective_title in its output. The
--       feynman client reads this RPC with the ANON key + x-sciencekit-key secret, so
--       it cannot read the authenticated-only objective tables directly — the
--       SECURITY DEFINER RPC must carry the objective through. Gate/limit/marks math
--       reproduced VERBATIM from the live definition; only the two columns are added
--       (additive ⇒ the currently-deployed UnitGaps that ignores them keeps working).
--
-- No grants are widened: objectives/topic_objective_map stay authenticated-read; the
-- objective reaches anon callers only through the definer-owned RPC.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  objective_mastery  += objective_id, objective_title
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.objective_mastery
with (security_invoker = true) as
select
  c.id          as class_id,
  c.name        as class_name,
  c.year_group,
  t.id          as topic_id,
  t.name        as topic_name,
  t.key_stage,
  tm.unit_id,
  tm.unit_code,
  tm.unit_title,
  count(*)                                          as attempts,
  count(*) filter (where r.is_correct is not null)  as marked,
  count(*) filter (where r.is_correct)              as correct,
  round(100.0 * count(*) filter (where r.is_correct)
        / nullif(count(*) filter (where r.is_correct is not null), 0), 0) as pct_correct,
  count(distinct r.student_id)                      as students,
  max(r.answered_at)::date                          as last_seen,
  tom.objective_id                                  as objective_id,
  o.title                                           as objective_title
from public.responses r
join public.questions q on q.id = r.question_id
join public.topics    t on t.id = q.topic_id
join public.classes   c on c.id = r.class_id
left join public.topic_map           tm  on tm.retrieval_topic_id = t.id
left join public.topic_objective_map tom on tom.topic_id = t.id
left join public.objectives          o   on o.id = tom.objective_id
group by c.id, c.name, c.year_group, t.id, t.name, t.key_stage,
         tm.unit_id, tm.unit_code, tm.unit_title, tom.objective_id, o.title;

comment on view public.objective_mastery is
  'Live per-class × per-objective mastery (attempts/correct/%/last_seen) joined to the planning unit AND the mastery-graph objective (objective_id/objective_title). RLS-respecting (security_invoker).';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  class_unit_gaps  += objective_id, objective_title  (gate verbatim from live)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.class_unit_gaps(uuid, text);

create or replace function public.class_unit_gaps(p_class_id uuid, p_unit_id text)
returns table(
  topic_id uuid, topic_name text, pct_correct numeric,
  marked int, students int, last_seen date,
  objective_id uuid, objective_title text
)
language sql
security definer
set search_path = public
as $$
  select om.topic_id, om.topic_name, om.pct_correct,
         om.marked::int, om.students::int, om.last_seen,
         om.objective_id, om.objective_title
  from public.objective_mastery om
  where om.class_id = p_class_id
    and om.unit_id  = p_unit_id
    and om.marked  >= 5
    and (
      nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
          = (select value from private.app_config where key = 'sciencekit_key')
      or public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  order by om.pct_correct asc, om.marked desc
  limit 12;
$$;

comment on function public.class_unit_gaps(uuid, text) is
  'A class''s weakest topics within one ScienceKit unit (aggregate, non-personal), now carrying objective_id/objective_title so the planner can group gaps by objective. Gate: x-sciencekit-key OR moderator OR teacher-of-class OR HoD.';

grant execute on function public.class_unit_gaps(uuid, text) to anon, authenticated;

commit;
