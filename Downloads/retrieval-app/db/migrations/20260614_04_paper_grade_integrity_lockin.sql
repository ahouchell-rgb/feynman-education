-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy — verified 2026-06-18
-- (paper_responses write + paper_attempts.awarded_marks revoked from the client).
-- Mirrors the retrieval-practice lock-in (migration 02) for exam papers; could
-- only be applied once the mark-paper-answer client was live.
--
-- mark-paper-answer (v3) now grades from the DB's marking points and writes
-- paper_responses + recomputes paper_attempts.awarded_marks/total_marks via the
-- service role. Previously `pr_student_self` / `pa_student_self` were cmd=ALL, so
-- a pupil could PATCH their own paper_responses.marks_awarded (and the attempt's
-- awarded_marks) to full marks. Lock the client out of writing marks:

-- paper_responses: only the function (service role) writes them now.
revoke insert, update, delete on public.paper_responses from authenticated, anon;

-- paper_attempts: a pupil may still create an attempt and mark it submitted, but
-- must NOT set awarded_marks (the function owns it). Column grants gate WHICH
-- columns; the pa_student_self policy still gates WHICH rows (their own).
-- total_marks is grantable at insert (the current client sends it at creation)
-- but the function recomputes it authoritatively on every answer, and
-- awarded_marks is deliberately omitted so it can never be client-set.
revoke insert, update on public.paper_attempts from authenticated, anon;
grant insert (paper_id, student_id, class_id, mode, total_marks, started_at) on public.paper_attempts to authenticated;
grant update (submitted_at) on public.paper_attempts to authenticated;

-- Verify after applying:
--   select has_table_privilege('authenticated','public.paper_responses','UPDATE');  -- expect false
--   select has_column_privilege('authenticated','public.paper_attempts','awarded_marks','UPDATE'); -- expect false
--   select has_column_privilege('authenticated','public.paper_attempts','submitted_at','UPDATE');  -- expect true
