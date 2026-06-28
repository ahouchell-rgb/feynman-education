-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Server-side source of truth for a school's AI-mark usage vs its fair-use cap.
-- The soft cap (amber bar / "over allowance") is ALREADY surfaced in the admin
-- Schools view (get_school_plans + markAllowance in plans.js) — caps stay SOFT,
-- pupils are never blocked at the soft line. This function adds a HARD BACKSTOP that
-- the mark-answer edge function checks before an AI call, so a runaway/abusive tenant
-- can't run up unbounded Anthropic cost. The cap logic mirrors plans.js markAllowance:
--   free          -> 2,000 / calendar month
--   essentials    -> 250,000 / term
--   core / single -> 1,500 x committed_pupils / term
--   marks_allowance override on the school row wins
-- A comped pilot (plan_status='pilot', e.g. James Hornsby) is NEVER capped/blocked.
-- over_backstop = used > 3x allowance (well above the soft cap, so it only ever
-- catches genuine abuse, never normal "over fair-use" usage).
create or replace function public.school_mark_status(p_school_id uuid)
returns table(school_id uuid, plan text, plan_status text, used int, allowance int,
              ratio numeric, over_cap boolean, over_backstop boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (
    select id, plan, plan_status, marks_allowance, committed_pupils, term_start
    from public.schools where id = p_school_id
  ),
  cap as (
    select case
      when (select plan_status from s) = 'pilot' then null         -- comped: never capped
      when (select marks_allowance from s) is not null then (select marks_allowance from s)::int
      when (select plan from s) = 'free' then 2000
      when (select plan from s) = 'essentials' then 250000
      when (select plan from s) in ('core','single_cohort')
        then case when (select committed_pupils from s) is not null
                  then 1500 * (select committed_pupils from s)::int end
      else null
    end as allowance
  ),
  win as (
    select case when (select plan from s) = 'free'
                then date_trunc('month', now())
                else coalesce((select term_start from s)::timestamptz, now() - interval '90 days')
           end as since
  ),
  u as (
    select count(*)::int as used
    from public.ai_usage a, win
    where a.school_id = p_school_id and a.call_label = 'first' and a.ts >= win.since
  )
  select p_school_id,
         (select plan from s),
         (select plan_status from s),
         (select used from u),
         (select allowance from cap),
         case when coalesce((select allowance from cap), 0) = 0 then null
              else round((select used from u)::numeric / (select allowance from cap), 3) end,
         case when (select allowance from cap) is null then false
              else (select used from u) > (select allowance from cap) end,
         case when (select allowance from cap) is null then false
              else (select used from u) > 3 * (select allowance from cap) end;
$$;

-- Service-role (the mark-answer edge function) is the only caller; no client needs it
-- (the admin Schools view already has get_school_plans). Lock it down.
revoke all on function public.school_mark_status(uuid) from public, anon, authenticated;
grant execute on function public.school_mark_status(uuid) to service_role;
