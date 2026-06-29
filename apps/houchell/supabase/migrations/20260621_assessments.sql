-- =====================================================================
-- Houchell Education — Assessments & QLA (NOW plan · E5)
-- Applied to prod: (pending)
--
-- Common assessments + per-question mark capture → question-level analysis
-- (QLA) by question, topic/objective and pupil. The other major data source
-- into the mastery graph besides retrieval. Owner-scoped to the teacher;
-- aggregation is computed in the app from the saved marks.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.assessments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id    uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title       text NOT NULL,
  students    text[] NOT NULL DEFAULT '{}',     -- the roster (names) for the grid
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  teacher_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  q_number      int NOT NULL DEFAULT 1,
  topic         text,
  objective_id  uuid REFERENCES public.objectives(id) ON DELETE SET NULL,
  max_marks     int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assessment_questions ON public.assessment_questions(assessment_id, q_number);

CREATE TABLE IF NOT EXISTS public.assessment_marks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  teacher_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  student_ref   text NOT NULL,
  marks         numeric NOT NULL DEFAULT 0,
  UNIQUE (question_id, student_ref)
);
CREATE INDEX IF NOT EXISTS idx_assessment_marks ON public.assessment_marks(assessment_id);

DROP TRIGGER IF EXISTS assessments_set_updated_at ON public.assessments;
CREATE TRIGGER assessments_set_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Owner-scoped RLS on all three.
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessments','assessment_questions','assessment_marks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I FOR ALL TO authenticated '
      'USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid())', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.assessments IS 'Common assessments + roster. Owner-scoped. Feeds QLA + the mastery graph.';
