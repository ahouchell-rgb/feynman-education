-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-21.
-- Part of the subject-agnostic marker work (branch feat/subject-agnostic-marker).
--
-- The deployed curriculum page (feynman-education origin/main, commit 2a324f5
-- "feat: subject-based curriculum filter") fetches units with a PostgREST embed:
--   units?select=*,subject:subjects(name,slug)
-- but no foreign-key relationship between units and subjects existed, so the request
-- 400'd (PGRST200 "Could not find a relationship between 'units' and 'subjects'") and
-- the curriculum rendered "No units for <year>" for every year. The frontend shipped
-- ahead of this schema. This adds the missing link and backfills it.

alter table public.units
  add column if not exists subject_id uuid references public.subjects(id);

-- Backfill: every existing unit is Science (the only subject so far).
update public.units u
   set subject_id = s.id
  from public.subjects s
 where s.name = 'Science'
   and u.subject_id is null;

-- Make the new FK relationship discoverable by PostgREST immediately.
notify pgrst, 'reload schema';
