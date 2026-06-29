-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Tier-1: self-serve onboarding. Lets an UNAFFILIATED signed-in user stand up their
-- own school without a moderator running SQL: creates the school (free/trial) and
-- makes the caller its lead (role 'hod', school_id set). From there they create
-- classes (classes_insert_teacher already allows is_staff) and pupils self-enrol via
-- join_class_by_code (which now stamps the pupil's school — 20260618_03).
--
-- SAFE multi-tenant-wise: guarded to callers with school_id IS NULL (so enrolled
-- pupils / existing staff can't hijack), and 'hod' is dept-scoped — is_moderator()
-- stays false, so a new school lead gets NO cross-tenant access (only their own,
-- initially-empty, school). Becoming hod-of-your-own-empty-school grants nothing
-- beyond that school. (Sign-up spam is a product/abuse concern, not an isolation one
-- — gate with email verification / rate limiting before GA.)
create or replace function public.create_school(p_name text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_role text; v_school uuid;
begin
  select role, school_id into v_role, v_school from public.profiles where id = auth.uid();
  if v_role is null then raise exception 'no profile for caller' using errcode = '42501'; end if;
  if v_role = 'moderator' then raise exception 'platform admins manage schools in the admin panel'; end if;
  if v_school is not null then raise exception 'you already belong to a school'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'a school name is required'; end if;
  insert into public.schools (name) values (left(btrim(p_name), 120)) returning id into v_id;
  update public.profiles set school_id = v_id, role = 'hod', updated_at = now() where id = auth.uid();
  return json_build_object('school_id', v_id, 'name', left(btrim(p_name), 120), 'role', 'hod');
end $$;
revoke all on function public.create_school(text) from public, anon;
grant execute on function public.create_school(text) to authenticated;
