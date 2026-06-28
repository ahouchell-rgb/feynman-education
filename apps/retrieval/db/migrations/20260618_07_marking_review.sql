-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Tier-1: marking-trust. AI marking is only sellable if the teacher stays in
-- control. mark-answer already produces a confidence ('high'|'medium'|'low') per
-- AI verdict; persist it so a teacher can review the ones the model itself was
-- unsure about (plus pupil-flagged ones) and override in one click — rather than
-- spot-checking blind. teacher_reviewed clears an item from the queue once seen.
--
-- Existing rows stay ai_confidence = NULL (treated as not-needing-review, so the
-- queue starts from new marks). Deterministic marks (numerical/exact/cache) are
-- recorded as 'high'. The override itself already works via the responses_update
-- policy (teacher of the class / HoD / moderator) added in 20260614_03.
alter table public.responses add column if not exists ai_confidence text
  check (ai_confidence in ('high','medium','low'));
alter table public.responses add column if not exists teacher_reviewed boolean not null default false;

-- The review queue: low/medium-confidence marks not yet reviewed, newest first.
create index if not exists responses_review_queue_idx
  on public.responses (class_id, answered_at desc)
  where ai_confidence in ('low','medium') and teacher_reviewed = false;

-- Let a teacher mark their own class's responses reviewed (the responses_update
-- policy already authorises the row; this column is part of that same grant).
grant update (teacher_reviewed, is_correct, marks_awarded) on public.responses to authenticated;
