-- =====================================================================
-- ScienceKit — Build 4: HTML widgets + Chat-with-Claude
-- Applied to prod: 2026-05-13
-- This file is kept as a record so the schema is reproducible from migrations.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lesson_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Widget',
  html text NOT NULL,
  position numeric(10,4) NOT NULL DEFAULT 1,
  default_height int NOT NULL DEFAULT 480,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_widgets_lesson_teacher
  ON public.lesson_widgets(lesson_id, teacher_id, position);

DROP TRIGGER IF EXISTS widgets_set_updated_at ON public.lesson_widgets;
CREATE TRIGGER widgets_set_updated_at
  BEFORE UPDATE ON public.lesson_widgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.lesson_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "widgets_owner_all" ON public.lesson_widgets;
CREATE POLICY "widgets_owner_all" ON public.lesson_widgets
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.lesson_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_lesson_teacher_time
  ON public.lesson_chat_messages(lesson_id, teacher_id, created_at);

ALTER TABLE public.lesson_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_owner_all" ON public.lesson_chat_messages;
CREATE POLICY "chat_owner_all" ON public.lesson_chat_messages
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.daily_token_usage (
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  request_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, day)
);

ALTER TABLE public.daily_token_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_owner_read" ON public.daily_token_usage;
CREATE POLICY "usage_owner_read" ON public.daily_token_usage
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());
