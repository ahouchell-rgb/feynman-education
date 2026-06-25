-- =====================================================================
-- Feynman Education — Subject config foundation (NOW plan · T6.1)
-- Applied to prod: 2026-06-25 (verified live: subjects/strands/objectives + units.subject_id)
--
-- De-sciences the engine WITHOUT a rewrite: the hard-coded science
-- discipline becomes data. Additive only — existing science units keep
-- working (science is seeded as a subject and units are backfilled to it),
-- so nothing breaks. This is the keystone for the subjects-first expansion;
-- subject-aware theming (T6.2) and prompts (T6.3) build on it.
-- =====================================================================

-- ── subjects: top-level subject (Science, Maths, English, …) ──────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  color      text,
  accent     text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── strands: sub-areas within a subject (Science → Bio/Chem/Phys) ─────────
CREATE TABLE IF NOT EXISTS public.strands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  slug       text NOT NULL,
  name       text NOT NULL,
  color      text,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (subject_id, slug)
);

-- ── curriculum_specs: an exam-board / national-curriculum spec ────────────
CREATE TABLE IF NOT EXISTS public.curriculum_specs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_board text,                    -- AQA | Edexcel | OCR | WJEC | NC | IB | …
  title      text NOT NULL,
  key_stage  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── objectives: the generic objective taxonomy (subject × key_stage × spec) ─
-- One canonical "what a pupil should know/do", that retrieval topics, QLA and
-- the mastery graph all map to — across any subject or board.
CREATE TABLE IF NOT EXISTS public.objectives (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  strand_id  uuid REFERENCES public.strands(id) ON DELETE SET NULL,
  spec_id    uuid REFERENCES public.curriculum_specs(id) ON DELETE SET NULL,
  key_stage  text,
  code       text,                    -- e.g. spec point "4.1.1.1"
  title      text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_objectives_subject ON public.objectives(subject_id, key_stage);

-- ── units gain a subject link (additive; discipline kept for compatibility) ─
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

-- ── RLS: these are non-personal catalog tables — readable by any signed-in
--    user; writes are service-role / admin only (no client write policy). ──
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subjects','strands','curriculum_specs','objectives'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── Seed: Science (with its three strands) + Maths + English ──────────────
INSERT INTO public.subjects (slug, name, color, accent, sort_order) VALUES
  ('science', 'Science',     '#5e7c4b', '#5e7c4b', 0),
  ('maths',   'Mathematics', '#2e3a5f', '#2e3a5f', 1),
  ('english', 'English',     '#b95a3c', '#b95a3c', 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.strands (subject_id, slug, name, color, sort_order)
SELECT s.id, v.slug, v.name, v.color, v.ord
FROM public.subjects s
CROSS JOIN (VALUES
  ('biology',   'Biology',   '#5e7c4b', 0),
  ('chemistry', 'Chemistry', '#b95a3c', 1),
  ('physics',   'Physics',   '#2e3a5f', 2)
) AS v(slug, name, color, ord)
WHERE s.slug = 'science'
ON CONFLICT (subject_id, slug) DO NOTHING;

-- Backfill: every existing unit is science today.
UPDATE public.units
SET subject_id = (SELECT id FROM public.subjects WHERE slug = 'science')
WHERE subject_id IS NULL;

COMMENT ON TABLE public.subjects IS 'Top-level subjects. The science discipline is now a seeded subject — the engine is subject-agnostic.';
COMMENT ON TABLE public.objectives IS 'Generic objective taxonomy (subject × key_stage × spec). Canonical target the mastery graph + QLA map to.';
