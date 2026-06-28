-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
--
-- Let Heads of Department resolve marking appeals for their department, and add
-- the missing responses UPDATE policy. There was NO update policy on responses,
-- so the "overturn" action's PATCH affected 0 rows for everyone (incl. teachers)
-- — the flag was marked resolved but the pupil's mark was never corrected.
-- Both policies gain a HoD branch mirroring responses_select (teacher of the
-- class OR moderator OR HoD of the class's teacher). Pupils get no branch, so
-- the grade-integrity lock-in still holds — they can't alter their own marks.

drop policy if exists marking_flags_update on public.marking_flags;
create policy marking_flags_update on public.marking_flags
for update using (
  (exists (select 1 from classes where classes.id = marking_flags.class_id and classes.teacher_id = (select auth.uid())))
  or is_moderator()
  or (exists (select 1 from classes c2 join profiles tp on tp.id = c2.teacher_id
              where c2.id = marking_flags.class_id and tp.hod_id = (select auth.uid())))
);

drop policy if exists responses_update on public.responses;
create policy responses_update on public.responses
for update using (
  (exists (select 1 from classes where classes.id = responses.class_id and classes.teacher_id = (select auth.uid())))
  or is_moderator()
  or (exists (select 1 from classes c2 join profiles tp on tp.id = c2.teacher_id
              where c2.id = responses.class_id and tp.hod_id = (select auth.uid())))
)
with check (
  (exists (select 1 from classes where classes.id = responses.class_id and classes.teacher_id = (select auth.uid())))
  or is_moderator()
  or (exists (select 1 from classes c2 join profiles tp on tp.id = c2.teacher_id
              where c2.id = responses.class_id and tp.hod_id = (select auth.uid())))
);
