-- STATUS: NOT APPLIED. Part of the subject-agnostic marker work (branch
-- feat/subject-agnostic-marker). Apply to project uvzukwoxqhcxaxtzrziy only after
-- the rewired mark-answer / mark-paper-answer edge functions are reviewed; the
-- functions tolerate this column being absent (resolution falls back to 'science'),
-- so order of deploy is not load-bearing.
--
-- Adds subjects.marker_profile: which marking-prompt overlay a subject uses. The AI
-- markers (mark-answer, mark-paper-answer) compose their prompt as a shared, subject-
-- agnostic engine + a per-subject overlay; this column picks the overlay. It is
-- resolved server-side (question/paper -> subject -> marker_profile) and never trusted
-- from the client.
--
-- DEFAULT 'science' so every existing subject keeps today's exact behaviour with zero
-- backfill — the science overlay is the verbatim old prompt. Kept as free text (like
-- papers.exam_board) rather than an enum/FK: valid values are defined in code
-- (supabase/functions/_shared/marking/registry.ts) and any unknown value falls back to
-- 'science' in overlayFor(), so a typo or a not-yet-coded profile degrades safely to
-- science marking instead of failing a mark. Add a new value here only once its overlay
-- exists in the registry.

alter table public.subjects
  add column if not exists marker_profile text not null default 'science';

comment on column public.subjects.marker_profile is
  'Marking-prompt overlay key for the AI markers (see _shared/marking/registry.ts). Free text; unknown values fall back to ''science''. Default ''science''.';
