-- =====================================================================
-- RETRIEVAL-APP migration — make retrieval multi-subject
-- TARGET REPO: retrieval-app  (NOT feynman-education)
-- Applied to prod: (pending — apply in the retrieval-app migration set)
--
-- Both apps share ONE Supabase anchor DB, so this references public.subjects /
-- public.objectives, which the feynman-education subject_foundation migration
-- already created + seeded (science/maths/english + science strands). This
-- migration de-sciences the RETRIEVAL side: topics gain a subject, the weakness
-- RPCs return it (and accept an optional subject filter), and — where a topic is
-- mapped to a canonical objective — it backfills the shared topic_objective_map
-- crosswalk so the feynman dashboards blend retrieval + assessment by id.
--
-- ASSUMPTION ABOUT YOUR SCHEMA: the retrieval topics live in public.topics with
-- a uuid `id` (the `topic_id` the RPCs already return) and a text `name`. If your
-- table/columns differ, adjust the identifiers below — the shape is all that
-- matters. Everything here is additive + idempotent.
-- =====================================================================

-- 1) Topics gain a subject (additive; defaults to science so nothing breaks).
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS objective_id uuid REFERENCES public.objectives(id) ON DELETE SET NULL;

-- Backfill every existing topic to Science (the retrieval product is science today).
UPDATE public.topics
SET subject_id = (SELECT id FROM public.subjects WHERE slug = 'science')
WHERE subject_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics_subject ON public.topics(subject_id);

-- 2) Keep the shared crosswalk in sync: any topic that names its objective_id is
--    mirrored into topic_objective_map (which the feynman blend reads). Safe to
--    re-run; only maps topics that have been tagged.
INSERT INTO public.topic_objective_map (topic_id, objective_id, subject_id, source)
SELECT t.id, t.objective_id, t.subject_id, 'seeded'
FROM public.topics t
WHERE t.objective_id IS NOT NULL
ON CONFLICT (topic_id) DO UPDATE
  SET objective_id = EXCLUDED.objective_id, subject_id = EXCLUDED.subject_id;

-- 3) Weakness RPCs: return subject_id + accept an OPTIONAL subject filter so the
--    SLT/department dashboards can split by subject. Signatures stay backward
--    compatible (new param defaults to NULL = all subjects). Replace the bodies
--    below with your actual aggregation — only the SELECT list + the WHERE filter
--    on s.slug are the multi-subject additions (marked ★).
--
--    NOTE: these are templates. If your real RPCs differ, the only required
--    edits are: add `t.subject_id` (and optionally `sub.slug`) to the RETURNS
--    TABLE + SELECT, and add the `(p_subject IS NULL OR sub.slug = p_subject)`
--    predicate. Everything else (gating via x-sciencekit-key, the marks math)
--    is unchanged.

-- class_weak_topics(p_class_id uuid, p_limit int, p_min_marked int, p_subject text DEFAULT NULL)
--   RETURNS TABLE(topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked int, students int)
--   ... FROM <your marks join> m
--       JOIN public.topics t ON t.id = m.topic_id
--       LEFT JOIN public.subjects sub ON sub.id = t.subject_id
--      WHERE m.class_id = p_class_id
--        AND (p_subject IS NULL OR sub.slug = p_subject)        -- ★ subject filter
--      GROUP BY t.id, t.name, t.subject_id ...
--      -- SELECT t.id, t.name, t.subject_id AS subject_id, ...  -- ★ return subject

-- Do the same for:
--   student_weak_topics(p_student_id uuid, p_limit int, p_subject text DEFAULT NULL)
--   class_intervention_list(p_class_id uuid, p_threshold int, p_subject text DEFAULT NULL)
--
-- After deploying, re-GRANT EXECUTE to authenticated for each new signature.

COMMENT ON COLUMN public.topics.subject_id IS
  'Subject of this retrieval topic (shared public.subjects). Defaults to science; enables multi-subject retrieval + per-subject dashboards.';
COMMENT ON COLUMN public.topics.objective_id IS
  'Optional canonical objective (shared public.objectives) this topic assesses. Mirrored into topic_objective_map for the mastery blend.';
