-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-21.
-- Part of the subject-agnostic marker work (branch feat/subject-agnostic-marker).
--
-- Follow-on to 20260621_01: once the units->subjects FK existed, the curriculum embed
-- `subject:subjects(name,slug)` still failed with 42703 "column subjects.slug does not
-- exist". The deployed subject filter reads two columns that the subjects table never
-- had: slug (chip key + the embed) and sort_order (chip ordering, via
-- subjects?select=slug,name&order=sort_order.asc). Add both.

alter table public.subjects
  add column if not exists slug text,
  add column if not exists sort_order integer not null default 0;

-- Backfill slug from name (Science -> science).
update public.subjects
   set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
 where slug is null;

create unique index if not exists subjects_slug_key on public.subjects (slug);

notify pgrst, 'reload schema';
