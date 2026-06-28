-- =====================================================================
-- Feynman Education — foreign-key / hot-path indexes (additive)
-- Applied to prod: (pending)
--
-- Several recently-added tables foreign-key or filter on columns that have
-- no supporting index, so deletes of the parent row and the per-parent
-- lookups full-scan the child table. All CREATE INDEX IF NOT EXISTS, so this
-- is purely additive and safe to replay. Named to sort after the migrations
-- that create the referenced tables.
-- =====================================================================

-- assessment_questions.objective_id — joined on the mastery-aggregation path
-- (objective_mastery joins objectives o ON o.id = q.objective_id) yet unindexed.
CREATE INDEX IF NOT EXISTS idx_assessment_questions_objective
  ON public.assessment_questions(objective_id);

-- parent_reports — only (teacher_id, week_start) existed; the guardian/link FKs
-- (used by per-guardian lookups and cascaded on guardian/link delete) were not.
CREATE INDEX IF NOT EXISTS idx_parent_reports_link
  ON public.parent_reports(link_id);
CREATE INDEX IF NOT EXISTS idx_parent_reports_guardian
  ON public.parent_reports(guardian_id);

-- guardian_student — guardian_id (FK CASCADE) and class_id (FK SET NULL) were
-- unindexed, so a guardian/class delete scans this table.
CREATE INDEX IF NOT EXISTS idx_guardian_student_guardian
  ON public.guardian_student(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_student_class
  ON public.guardian_student(class_id);

-- content_items.author_id — the RLS policy filters author_id = auth.uid() on
-- every access, but only `status` was indexed.
CREATE INDEX IF NOT EXISTS idx_content_items_author
  ON public.content_items(author_id);
