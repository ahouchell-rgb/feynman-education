-- =====================================================================
-- Feynman Education — Retrieval-topic ↔ objective crosswalk (NOW plan · P2 #9)
-- Applied to prod: (pending)
--
-- The mastery blend (lib/mastery) currently joins retrieval weakness to
-- assessment QLA by objective NAME — fragile. This crosswalk lets it join on
-- IDENTIFIERS: each retrieval topic (topics.id, owned by the retrieval-app but
-- in the same anchor DB) maps to one canonical objective (objectives.id, this
-- repo). The dashboards enrich retrieval rows with objective_id from here before
-- blending; name matching stays as the fallback when a topic isn't mapped yet.
--
-- topic_id is NOT foreign-keyed (the topics table is owned by the retrieval-app
-- migration set; we avoid a cross-repo FK), but objective_id is, so a deleted
-- objective cleans up its mappings.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.topic_objective_map (
  topic_id     uuid PRIMARY KEY,                       -- retrieval topics.id (shared DB)
  objective_id uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  subject_id   uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  source       text NOT NULL DEFAULT 'manual',         -- manual | seeded | ai
  confidence   numeric,                                 -- 0..1 when AI-suggested
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topic_objective_objective ON public.topic_objective_map(objective_id);
CREATE INDEX IF NOT EXISTS idx_topic_objective_subject ON public.topic_objective_map(subject_id);

-- Non-personal catalog mapping: readable by any signed-in user (the dashboards
-- need it); writes are service-role / admin only (no client write policy).
ALTER TABLE public.topic_objective_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topic_objective_read ON public.topic_objective_map;
CREATE POLICY topic_objective_read ON public.topic_objective_map
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.topic_objective_map TO authenticated;

COMMENT ON TABLE public.topic_objective_map IS
  'Crosswalk: retrieval topic_id → canonical objective_id (+ subject). Lets the mastery blend join retrieval and assessment on identifiers, not names.';
