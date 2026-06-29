-- Class's weakest topics overall, for the half-term feedforward selection
-- (Houchell cron). Same shared-secret gate as class_unit_gaps; aggregate only.
--
-- SECRET REDACTED FOR VCS: the live DB (and the ScienceKit SK_API_KEY env) hold
-- the real value. Substitute it for the placeholder before replaying on a fresh
-- database, or read it from a DB setting (see 20260615_06 note).
create or replace function public.class_weak_topics(
  p_class_id uuid, p_limit int default 5, p_min_marked int default 8)
returns table(topic_id uuid, topic_name text, pct_correct numeric, marked int, students int)
language sql
security definer
set search_path = public
as $$
  select om.topic_id, om.topic_name, om.pct_correct, om.marked::int, om.students::int
  from public.objective_mastery om
  where om.class_id = p_class_id
    and om.marked >= p_min_marked
    and coalesce(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
        = 'REPLACE_WITH_SCIENCEKIT_SHARED_SECRET'  -- redacted; see header note
  order by om.pct_correct asc, om.marked desc
  limit p_limit;
$$;

grant execute on function public.class_weak_topics(uuid, int, int) to anon, authenticated;
