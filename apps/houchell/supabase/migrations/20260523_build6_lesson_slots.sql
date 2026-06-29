-- =====================================================================
-- ScienceKit — Build 6: Lesson page redesign
-- Per-lesson, per-teacher single-file slots for the main slide deck
-- and the lesson-level scheme of work doc.
-- The existing 8 section fields and lesson_teacher_content are left
-- in place (orphaned) for safe rollback. UI is removed in app code.
-- =====================================================================

-- One slide deck per lesson per teacher
CREATE TABLE IF NOT EXISTS public.lesson_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_slides_lookup
  ON public.lesson_slides(lesson_id, teacher_id);

CREATE TRIGGER lesson_slides_set_updated_at
  BEFORE UPDATE ON public.lesson_slides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.lesson_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_slides_owner_all" ON public.lesson_slides
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- One scheme-of-work doc per lesson per teacher
CREATE TABLE IF NOT EXISTS public.lesson_sow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_sow_lookup
  ON public.lesson_sow(lesson_id, teacher_id);

CREATE TRIGGER lesson_sow_set_updated_at
  BEFORE UPDATE ON public.lesson_sow
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.lesson_sow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_sow_owner_all" ON public.lesson_sow
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
