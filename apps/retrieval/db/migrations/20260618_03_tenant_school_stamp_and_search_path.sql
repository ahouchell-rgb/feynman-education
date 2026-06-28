-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Multi-tenant readiness (Tier-0 isolation pass). Two changes:
--
-- 1. join_class_by_code now STAMPS the pupil's school_id from the class they join.
--    Tenant attribution (plan gating, fair-use metering, get_school_plans counts,
--    mark-answer cost attribution) keys off school. A pupil's school used to come
--    only from the profiles.school_id column DEFAULT set at signup — so a pupil who
--    joined a different school's class kept the wrong school. Deriving it from the
--    class makes attribution follow the pupil's actual school. Safe for the current
--    single-school deployment (class.school_id == the default, so it's a no-op).
--    Isolation itself does NOT depend on school_id (RLS scopes by teacher/membership)
--    — this is about correct attribution, not access control.
--
--    NOTE: the profiles.school_id column DEFAULT (the James-Hornsby hardcode) is
--    intentionally LEFT in place for now. Dropping it requires teacher provisioning
--    (manage-student create_teacher / onboarding) to assign school explicitly, which
--    is Tier-1 onboarding work. Drop it then, not before, or new teachers land with
--    NULL school (and school_plan_allows_custom_questions treats "no school" as
--    ungated — an entitlement hole). Tracked for the onboarding flow.
--
-- 2. Pin search_path on the two functions the security advisor flagged as
--    function_search_path_mutable (a SECURITY DEFINER function with a mutable
--    search_path is a privilege-escalation vector).

create or replace function public.join_class_by_code(p_code text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text; v_school uuid;
begin
  select c.id, c.name, c.school_id into v_id, v_name, v_school from classes c
    where upper(c.join_code) = upper(btrim(p_code)) limit 1;
  if v_id is null then return; end if;
  insert into class_members (class_id, student_id) values (v_id, auth.uid())
    on conflict (class_id, student_id) do nothing;
  -- Stamp the joining pupil's school from the class, so plan/usage attribution
  -- follows their real tenant. Only when the class has a school and it differs.
  if v_school is not null then
    update profiles set school_id = v_school
      where id = auth.uid() and school_id is distinct from v_school;
  end if;
  return query select v_id, v_name;
end $$;
revoke all on function public.join_class_by_code(text) from public, anon;
grant execute on function public.join_class_by_code(text) to authenticated;

-- Pin search_path (security advisor: function_search_path_mutable).
alter function public.has_resource_access(uuid) set search_path = public, pg_temp;
alter function public.tg_set_updated_at() set search_path = public, pg_temp;
