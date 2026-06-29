-- =====================================================================
-- Feynman Education — Home-course (Springboard) synced progress
-- Applied to prod: (pending)
--
-- Lets the self-study KS3 course (public/learn/springboard.html) save a pupil's
-- progress server-side so it follows them across devices, and so teachers/parents
-- can see it — WITHOUT giving pupils logins. A pupil is identified the same way the
-- rest of the system identifies them: a per-pupil magic-link TOKEN (like the parent
-- portal), resolved server-side. The course posts its state to /api/springboard/*,
-- which writes with the service role. Teachers read their own classes' pupils only.
--
-- Two tables:
--   springboard_pupil    — token -> pupil (minted by a teacher for their class)
--   springboard_progress — the pupil's saved course state (one jsonb blob) + a few
--                          denormalised summary columns for cheap dashboard queries
--
-- Depends on: classes(id, teacher_id).
-- =====================================================================

-- --------------------------------------------------------------------
-- springboard_pupil: a pupil's personal course link. The teacher mints one
-- per pupil; the token goes in the link (…/learn?t=<token>). No PII beyond a
-- display name; the canonical id is the uuid.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.springboard_pupil (
  student_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text UNIQUE NOT NULL,
  student_name  text NOT NULL,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS springboard_pupil_class_idx ON public.springboard_pupil(class_id);

-- --------------------------------------------------------------------
-- springboard_progress: the saved course state. `state` is the app's whole
-- State.s blob (lessons, xp, streak, review schedule, badges…). The summary
-- columns are kept in sync by the API so a class dashboard can read them
-- without parsing every jsonb.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.springboard_progress (
  student_id  uuid PRIMARY KEY REFERENCES public.springboard_pupil(student_id) ON DELETE CASCADE,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  xp          int NOT NULL DEFAULT 0,
  crowns      int NOT NULL DEFAULT 0,
  streak      int NOT NULL DEFAULT 0,
  words       int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.springboard_pupil    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.springboard_progress ENABLE ROW LEVEL SECURITY;

-- Teachers may READ the pupils + progress for classes they own. There are NO
-- insert/update/delete policies: every write goes through the service role in the
-- API routes (token-resolved), so neither anon nor authenticated clients can write.
CREATE POLICY springboard_pupil_teacher_read ON public.springboard_pupil
  FOR SELECT TO authenticated
  USING (class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid()));

CREATE POLICY springboard_progress_teacher_read ON public.springboard_progress
  FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT sp.student_id FROM public.springboard_pupil sp
    WHERE sp.class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  ));

COMMENT ON TABLE public.springboard_pupil IS
  'Per-pupil magic-link token for the home-learning course. Minted by a teacher; resolved server-side. No login.';
COMMENT ON TABLE public.springboard_progress IS
  'Saved Springboard course state per pupil (cross-device sync). Written by the service role via /api/springboard/*; teachers read their own classes.';
