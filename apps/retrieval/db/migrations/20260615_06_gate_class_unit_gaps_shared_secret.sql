-- Harden the cross-app gaps RPC: require the ScienceKit shared-secret header
-- (x-sciencekit-key), matching the platform's existing cross-app auth pattern.
-- Without a matching header the WHERE is false and the function returns no rows,
-- so the bare anon key alone can no longer enumerate class gaps.
--
-- SECRET REDACTED FOR VCS: the live DB (and the ScienceKit client bundle) hold
-- the real value. Substitute the real shared secret for the placeholder below
-- before replaying this migration on a fresh database. Better still — and on the
-- hardening TODO — read it from a DB setting instead of a literal, e.g.
--   current_setting('app.sciencekit_key', true)
-- and set that out-of-band so no secret ever lands in version control.
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
    and coalesce(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
        = 'REPLACE_WITH_SCIENCEKIT_SHARED_SECRET'  -- redacted; see header note
  order by om.pct_correct asc, om.marked desc
  limit 12;
$$;
