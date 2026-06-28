-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
--
-- Deletion / offboarding. All child FKs to `classes` are already ON DELETE
-- CASCADE (class_members, responses, parent_tokens, paper_attempts, marking_flags,
-- class_topics, lesson_deliveries, paper_class_assignments), so deleting a class
-- or school cleans up its practice data automatically. Two gaps closed here:
--   1. ai_usage.school_id was ON DELETE NO ACTION → it would BLOCK a school
--      delete. Switch to SET NULL so the school can be removed while keeping the
--      (now un-attributed) cost telemetry.
--   2. Add authorised RPCs so staff have a safe deletion path (instead of raw
--      service-role SQL): delete_class (moderator or the class's own teacher) and
--      offboard_school (moderator only).
--
-- NOTE: offboard_school removes the school + its classes/subjects (cascading all
-- practice data) and detaches profiles (school_id -> null). It does NOT delete
-- pupil/teacher AUTH accounts — do that per-account via the manage-student edge
-- function (deleting auth.users needs the service role).

alter table public.ai_usage drop constraint if exists ai_usage_school_id_fkey;
alter table public.ai_usage
  add constraint ai_usage_school_id_fkey
  foreign key (school_id) references public.schools(id) on delete set null;

create or replace function public.delete_class(p_class_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_moderator()
          or exists (select 1 from classes where id = p_class_id and teacher_id = auth.uid())) then
    raise exception 'not authorised to delete this class';
  end if;
  delete from public.classes where id = p_class_id;  -- children cascade
  return found;
end;
$$;
revoke all on function public.delete_class(uuid) from public, anon;
grant execute on function public.delete_class(uuid) to authenticated;

create or replace function public.offboard_school(p_school_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare summary json;
begin
  if not public.is_moderator() then
    raise exception 'not authorised to offboard a school';
  end if;
  select json_build_object(
    'school_id',         p_school_id,
    'classes_removed',   (select count(*) from classes  where school_id = p_school_id),
    'subjects_removed',  (select count(*) from subjects where school_id = p_school_id),
    'profiles_detached', (select count(*) from profiles where school_id = p_school_id)
  ) into summary;
  delete from public.schools where id = p_school_id;  -- cascades classes/subjects; profiles & ai_usage -> null
  return summary;
end;
$$;
revoke all on function public.offboard_school(uuid) from public, anon;
grant execute on function public.offboard_school(uuid) to authenticated;
