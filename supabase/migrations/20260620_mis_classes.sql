-- =====================================================================
-- Feynman Education — MIS class rosters (Build 3 follow-up)
-- Applied to prod: (pending)
--
-- Adds class + class-membership staging from Wonde so guardian import can use
-- the ACTUAL class roster (which pupils are in a MIS class) instead of the
-- year-group heuristic. Service-role written; school-member RLS read.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.mis_classes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  mis_id     text NOT NULL,
  name       text,
  subject    text,
  year_group int,
  raw        jsonb,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, mis_id)
);
CREATE INDEX IF NOT EXISTS idx_mis_classes_school ON public.mis_classes(school_id);

CREATE TABLE IF NOT EXISTS public.mis_class_students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_mis_id   text NOT NULL,
  student_mis_id text NOT NULL,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_mis_id, student_mis_id)
);
CREATE INDEX IF NOT EXISTS idx_mis_class_students_class ON public.mis_class_students(school_id, class_mis_id);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mis_classes','mis_class_students'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_read ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member_read ON public.%I FOR SELECT TO authenticated '
      'USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()))', t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.mis_classes IS 'Staging mirror of MIS classes (Wonde). Read for precise guardian-import rostering.';
COMMENT ON TABLE public.mis_class_students IS 'MIS class membership (which pupils are in a class).';
