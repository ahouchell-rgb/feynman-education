-- STATUS: APPLIED (2026-06-19) to project uvzukwoxqhcxaxtzrziy.
--
-- Tier-0 multi-tenant hardening — the last structural blocker before a 2nd school.
-- Two coupled changes:
--
-- 1. Drop the single-school DEFAULT on profiles.school_id (it was the James Hornsby
--    pilot school id 'fbec5ed2-a238-4ab1-ba14-df85d030801e'). The DEFAULT silently
--    stamped EVERY new account into the JH tenant — a cross-tenant hazard the moment
--    a second school onboards — AND it broke self-serve onboarding: create_school's
--    `if v_school is not null` guard always tripped because a new signup was already
--    pre-stamped JH, so no one could ever start their own school. With the DEFAULT
--    gone, a new self-signup (handle_new_user → role 'student', NULL school) either
--    joins a class by code (join_class_by_code stamps the class's school, see
--    20260618_03) or calls create_school (now succeeds → becomes hod of a new school).
--    The 21 existing JH accounts carry an explicit school_id and are unaffected.
--    Superedes the note in 20260618_03 that deliberately KEPT this default until
--    Tier-1 onboarding shipped — onboarding (create_school, 20260618_08) is now live.
--
-- 2. Close the entitlement fallback. school_plan_allows_custom_questions() returned
--    coalesce(...,TRUE) — "no school row => not a gated customer => allow". That was
--    safe only while the DEFAULT guaranteed every profile had a school; once the
--    DEFAULT is dropped, a school-less caller would get ungated access to a paid
--    feature. Flip to coalesce(...,FALSE): no school => not yet an entitled customer
--    => deny. Moderators still bypass via is_moderator(); every real (school-stamped)
--    user is unchanged (James Hornsby is plan 'core' => allowed). Verified this was
--    the only function carrying the no-school-=>-allow pattern.

alter table public.profiles alter column school_id drop default;

create or replace function public.school_plan_allows_custom_questions()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_moderator() or coalesce((
    select s.plan in ('core','single_cohort')
    from public.profiles p
    join public.schools s on s.id = p.school_id
    where p.id = auth.uid()
  ), false);
$function$;
