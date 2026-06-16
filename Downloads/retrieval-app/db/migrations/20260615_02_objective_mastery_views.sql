-- Per class x objective mastery, computed live from responses.
-- security_invoker=true => the caller's RLS on responses/classes applies,
-- so a teacher sees only their own classes (no data leak via the view).
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
  max(r.answered_at)::date                          as last_seen
from public.responses r
join public.questions q on q.id = r.question_id
join public.topics    t on t.id = q.topic_id
join public.classes   c on c.id = r.class_id
left join public.topic_map tm on tm.retrieval_topic_id = t.id
group by c.id, c.name, c.year_group, t.id, t.name, t.key_stage,
         tm.unit_id, tm.unit_code, tm.unit_title;

comment on view public.objective_mastery is
  'Live per-class x per-objective mastery (attempts/correct/%/last_seen) joined to the planning unit. RLS-respecting.';

-- Weakest objectives first, ranked within each class. Callers filter weakness_rank <= N.
-- marked >= 5 keeps tiny samples out of "intervene here" lists.
create or replace view public.class_weak_objectives
with (security_invoker = true) as
select om.*,
  row_number() over (partition by om.class_id order by om.pct_correct asc, om.marked desc) as weakness_rank
from public.objective_mastery om
where om.marked >= 5;

comment on view public.class_weak_objectives is
  'objective_mastery filtered to marked>=5 and ranked weakest-first per class. Filter weakness_rank<=N for "top N gaps".';

grant select on public.objective_mastery   to authenticated;
grant select on public.class_weak_objectives to authenticated;
