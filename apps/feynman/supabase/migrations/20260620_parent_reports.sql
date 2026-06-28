-- =====================================================================
-- Feynman Education — Weekly Parent Progress Reports
-- Applied to prod: (pending)
--
-- The first parent-facing ("D2C") surface. A weekly cron generates, per
-- consented guardian↔pupil link, a plain-language report of what the
-- child's class was taught this week + the child's weakest objectives,
-- with a "practise now" link into retrieval-app. Reports are persisted
-- (like feedforward_sheets) and optionally emailed.
--
-- This migration owns the PARENT side only (guardians, links, reports) —
-- all owner-scoped to the teacher who manages the contact, with RLS that
-- mirrors feedforward_sheets / *_tokens.
--
-- DEPENDENCY (retrieval side, NOT created here — lives in the retrieval-app
-- repo alongside class_weak_topics / topic_preview_questions):
--   student_weak_topics(p_student_id uuid, p_limit int) RETURNS TABLE(
--     topic_id uuid, topic_name text, pct_correct numeric, marked int)
--   — same shape as class_weak_topics but scoped to one pupil. Gated by the
--   x-sciencekit-key secret like the other cross-DB RPCs. Until it exists the
--   report route falls back to class_weak_topics(retrieval_class_id), so the
--   report is class-level rather than child-specific.
-- =====================================================================

-- ---------------------------------------------------------------------
-- guardians: a parent/carer contact, owner-scoped to the teacher.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardians (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One contact row per email per teacher (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_guardians_teacher_email
  ON public.guardians (teacher_id, lower(email));

DROP TRIGGER IF EXISTS guardians_set_updated_at ON public.guardians;
CREATE TRIGGER guardians_set_updated_at
  BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guardians_owner_all ON public.guardians;
CREATE POLICY guardians_owner_all ON public.guardians
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardians TO authenticated;

-- ---------------------------------------------------------------------
-- guardian_student: links a guardian to one pupil, in one class, with
-- consent tracking. student_id is a retrieval-app pupil id (same anchor
-- DB post-unification, but no FK — retrieval owns that table). class_id
-- points at the teacher's ScienceKit class (for "taught this week" + the
-- retrieval class link). Consent is REQUIRED before any report is sent.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardian_student (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_id       uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  class_id          uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id        uuid,                       -- retrieval pupil id (no cross-owner FK)
  student_name      text NOT NULL,
  consent_status    text NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN ('pending','granted','revoked')),
  consent_at        timestamptz,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guardian_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_student_teacher
  ON public.guardian_student(teacher_id);
-- The cron reads the consented links to know who to send to.
CREATE INDEX IF NOT EXISTS idx_guardian_student_consent
  ON public.guardian_student(consent_status) WHERE consent_status = 'granted';

DROP TRIGGER IF EXISTS guardian_student_set_updated_at ON public.guardian_student;
CREATE TRIGGER guardian_student_set_updated_at
  BEFORE UPDATE ON public.guardian_student
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.guardian_student ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guardian_student_owner_all ON public.guardian_student;
CREATE POLICY guardian_student_owner_all ON public.guardian_student
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_student TO authenticated;

-- ---------------------------------------------------------------------
-- parent_reports: a generated weekly report. Persisted so it's reusable
-- (preview/re-send) rather than fire-and-forget. Owner = the teacher.
-- The cron writes these as the service role; a teacher can read/preview
-- their own and insert (the on-demand preview route).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id      uuid REFERENCES public.guardian_student(id) ON DELETE SET NULL,
  guardian_id  uuid REFERENCES public.guardians(id) ON DELETE SET NULL,
  student_name text,
  class_label  text,
  week_start   date NOT NULL,
  topics       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- snapshot of weak objectives used
  html         text NOT NULL,
  emailed      boolean NOT NULL DEFAULT false,
  emailed_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_reports_teacher_week
  ON public.parent_reports(teacher_id, week_start DESC);

ALTER TABLE public.parent_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_reports_owner_all ON public.parent_reports;
CREATE POLICY parent_reports_owner_all ON public.parent_reports
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.parent_reports TO authenticated;

COMMENT ON TABLE public.guardians IS
  'Parent/carer contacts, owner-scoped to the teacher who added them.';
COMMENT ON TABLE public.guardian_student IS
  'Guardian↔pupil links with consent. A weekly report is only generated/sent when consent_status = granted.';
COMMENT ON TABLE public.parent_reports IS
  'Generated weekly parent progress reports (HTML snapshot). Cron-written (service role), teacher-read.';
