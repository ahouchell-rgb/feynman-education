-- =====================================================================
-- ScienceKit — Build 2: Manage page support
-- Applied to prod: 2026-05-13
--
-- Adds archived_at timestamp to classes so the Manage page can show
-- "archived 3 days ago" and support audit/restore later. The existing
-- `archived` boolean is kept for fast filtering (and existing partial
-- index).
-- =====================================================================

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Backfill: existing archived rows get a best-effort timestamp
UPDATE public.classes
SET archived_at = updated_at
WHERE archived = true AND archived_at IS NULL;
