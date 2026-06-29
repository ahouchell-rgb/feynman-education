-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Get the ScienceKit shared secret OUT of the function body. 20260615_06 /
-- 20260616_10 inlined the secret as a string literal in the gate
-- (`... = 'THE_SECRET'`), so the real value lived in the live pg_proc source.
--
-- The natural fix — a DB setting read via current_setting('app.sciencekit_key') —
-- is NOT available here: the Supabase `postgres` role may not ALTER DATABASE SET a
-- custom parameter ("permission denied to set parameter"). So instead store the
-- secret in a locked-down `private` schema table and read it from the SECURITY
-- DEFINER gate. The VALUE is inserted OUT-OF-BAND and is NOT in VCS:
--
--   insert into private.app_config(key, value)
--   values ('sciencekit_key', '<the real secret>')
--   on conflict (key) do update set value = excluded.value;
--
-- The ScienceKit client is unchanged — it still sends the same x-sciencekit-key
-- header. anon/authenticated have no access to the `private` schema, so the secret
-- is unreadable via the API; only the definer-owned functions can see it.
--
-- FAIL-CLOSED: the header side is nullif(...,'') so a MISSING header collapses to
-- NULL, and `NULL = value` is NULL (not true) — the row is filtered out. If the
-- config row is absent the subquery is NULL too, so the gate also fails closed
-- (returns nothing) rather than open.
--
-- Residual risk NOT addressed here (needs a ScienceKit-client change): the secret
-- still ships in the SK client bundle, so it is effectively public and a determined
-- caller can pass it for an arbitrary p_class_id. Data returned is aggregate-only
-- (no identities/answers, marked>=N), so impact is low. Future hardening: bind the
-- call to a class_link row, or move to a short-lived signed token per request.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

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
    and nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
        = (select value from private.app_config where key = 'sciencekit_key')
  order by om.pct_correct asc, om.marked desc
  limit 12;
$$;
grant execute on function public.class_unit_gaps(uuid, text) to anon, authenticated;

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
    and nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key', '')
        = (select value from private.app_config where key = 'sciencekit_key')
  order by om.pct_correct asc, om.marked desc
  limit p_limit;
$$;
grant execute on function public.class_weak_topics(uuid, int, int) to anon, authenticated;
