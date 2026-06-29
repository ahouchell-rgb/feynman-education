-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-16.
--
-- THE FIX: teachers (profiles.role = 'teacher') could not create a class — every
-- POST /rest/v1/classes returned 403 and the "Create class" button did nothing.
-- Moderators were unaffected.
--
-- Root cause (it was the SELECT policy, not the INSERT policy):
-- The client posts with `Prefer: return=representation`, so PostgREST returns the
-- inserted row. Postgres applies the SELECT policy (classes_select) to rows
-- emitted by INSERT ... RETURNING, and raises "new row violates row-level security
-- policy for table classes" if the new row is not visible. classes_select gated a
-- teacher's visibility through user_teaches_class(id) — a SECURITY DEFINER helper
-- that RE-QUERIES classes (`SELECT 1 FROM classes WHERE id = ? AND teacher_id =
-- auth.uid()`). The row being inserted is not yet visible to that re-query in the
-- same command, so it returned false; with is_moderator()/user_in_class()/HoD all
-- false for a plain teacher inserting their own class, the RETURNING was rejected.
-- Moderators passed via is_moderator() (no row lookup needed) — hence only they
-- could create classes.
--
-- Verified by reproduction: teacher INSERT *without* RETURNING succeeded; *with*
-- RETURNING it failed; moderator succeeded either way.
--
-- Fix: also match the row's own teacher_id directly. That predicate is evaluated
-- on the in-flight NEW row (no re-query), so a teacher can see the class they just
-- created. No new exposure: user_teaches_class(id) already meant
-- teacher_id = auth.uid() for committed rows; this just additionally covers the
-- RETURNING row.

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
for select using (
  teacher_id = (select auth.uid())
  or user_teaches_class(id)
  or is_moderator()
  or user_in_class(id)
  or exists (select 1 from profiles tp where tp.id = classes.teacher_id and tp.hod_id = (select auth.uid()))
);
