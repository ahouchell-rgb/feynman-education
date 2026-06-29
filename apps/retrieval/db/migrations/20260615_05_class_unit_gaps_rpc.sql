-- Cross-app read for ScienceKit's planning view. SECURITY DEFINER so the
-- ScienceKit client (which holds only the anon key, no retrieval teacher JWT)
-- can fetch a class's weak objectives for one unit. Returns ONLY aggregate,
-- non-personal stats (topic, % correct, counts) -- never student identities or
-- answers -- and only topics with >=5 marked answers.
-- Superseded by 20260615_06 which gates this behind the shared-secret header.
create or replace function public.class_unit_gaps(p_class_id uuid, p_unit_id text)
returns table(
  topic_id uuid, topic_name text, pct_correct numeric,
  marked int, students int, last_seen date
)
language sql
security definer
set search_path = public
as $$
  select om.topic_id, om.topic_name, om.pct_correct,
         om.marked::int, om.students::int, om.last_seen
  from public.objective_mastery om
  where om.class_id = p_class_id
    and om.unit_id  = p_unit_id
    and om.marked  >= 5
  order by om.pct_correct asc, om.marked desc
  limit 12;
$$;

comment on function public.class_unit_gaps is
  'Aggregate weak objectives for one class within one ScienceKit unit. Non-personal; for the ScienceKit planning loop.';

grant execute on function public.class_unit_gaps(uuid, text) to anon, authenticated;
