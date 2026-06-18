-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Backfill classes.school_id from the owning teacher's school. Only 6 of 22 classes
-- had a school_id, so AI-cost attribution (mark-answer resolveSchoolId), the pupil
-- school-stamp (20260618_03), and fair-use metering (get_school_plans) were partial.
-- Derive each class's school from its teacher's profile; leave classes whose teacher
-- has no school untouched (no guessing).
update public.classes c
set school_id = p.school_id
from public.profiles p
where p.id = c.teacher_id
  and c.school_id is null
  and p.school_id is not null;
