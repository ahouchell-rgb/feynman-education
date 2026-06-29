-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
--
-- classes_select was USING(true): every class's join_code was world-readable,
-- and class_members_insert let a pupil self-enrol in ANY class_id — so anyone
-- could read all join codes and join any class.
--
--  * join_class_by_code(): SECURITY DEFINER — looks up the class by code and
--    enrols the caller. Joining is validated server-side, so codes need not be
--    readable. Idempotent (unique constraint on class_members(class_id,student_id)).
--  * classes_select: scoped to teacher / enrolled pupil / HoD-of-teacher /
--    moderator, using the existing SECURITY DEFINER helpers user_teaches_class()
--    and user_in_class() so there's no classes<->class_members RLS recursion.
--  * class_members_insert: pupils can no longer self-insert; teacher/moderator
--    only (pupils join via the RPC). Verified by impersonation: enrolled=1,
--    teacher=1, outsider=0.

create or replace function public.join_class_by_code(p_code text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text;
begin
  select c.id, c.name into v_id, v_name from classes c
    where upper(c.join_code) = upper(btrim(p_code)) limit 1;
  if v_id is null then return; end if;
  insert into class_members (class_id, student_id) values (v_id, auth.uid())
    on conflict (class_id, student_id) do nothing;
  return query select v_id, v_name;
end $$;
revoke all on function public.join_class_by_code(text) from public;
grant execute on function public.join_class_by_code(text) to authenticated;

drop policy if exists classes_select_by_join_code on public.classes;
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
for select using (
  user_teaches_class(id)
  or is_moderator()
  or user_in_class(id)
  or exists (select 1 from profiles tp where tp.id = classes.teacher_id and tp.hod_id = (select auth.uid()))
);

drop policy if exists class_members_insert on public.class_members;
create policy class_members_insert on public.class_members
for insert with check (
  user_teaches_class(class_members.class_id) or is_moderator()
);
