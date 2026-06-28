-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
-- Recorded here for reproducibility (the schema otherwise lives only in Supabase).
--
-- Closes a privilege-escalation on public.profiles. profiles_update_own uses
-- `USING (auth.uid() = id)` with a NULL WITH CHECK (so Postgres applies USING as
-- the check), and authenticated/anon held a TABLE-WIDE update grant. Together
-- that let any signed-in pupil:
--     PATCH /rest/v1/profiles?id=eq.<self>  {"role":"moderator"}
-- self-promote, and then read every pupil's name + email via can_view_profile().
--
-- A column-level revoke is a no-op against a table-wide grant, so we revoke the
-- table-level UPDATE and re-grant only the single column a pupil may self-edit.
-- All role/department/school changes go through the manage-student edge function
-- (service role), which bypasses these grants.
revoke update on public.profiles from authenticated, anon;
grant  update (display_name) on public.profiles to authenticated;
