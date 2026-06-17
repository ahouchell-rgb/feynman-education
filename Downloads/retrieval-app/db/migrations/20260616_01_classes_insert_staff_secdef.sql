-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-16.
--
-- Hardening (NOT the fix for the "teachers can't create a class" bug — see
-- 20260616_02). classes_insert_teacher's WITH CHECK queried `profiles` directly:
--
--   EXISTS (SELECT 1 FROM profiles
--           WHERE id = auth.uid()
--             AND role = ANY (ARRAY['teacher','moderator','hod']))
--
-- so the subquery runs under profiles' own RLS (can_view_profile). Every other
-- policy in this schema routes such role checks through a SECURITY DEFINER helper
-- (is_moderator, is_hod, user_teaches_class) to avoid depending on another table's
-- RLS. is_staff() follows that pattern. Same set of roles allowed (teacher /
-- moderator / hod) — no behaviour change.

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = any (array['teacher','moderator','hod'])
  );
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

drop policy if exists classes_insert_teacher on public.classes;
create policy classes_insert_teacher on public.classes
  for insert with check (public.is_staff());
