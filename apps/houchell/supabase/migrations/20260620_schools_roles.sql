-- =====================================================================
-- Houchell Education — Schools & staff roles (strategy Build 2 foundation)
-- Applied to prod: (pending)
--
-- The B2B surface: a Head of Dept / SLT user can see aggregated mastery
-- across ALL the teachers' classes in their school — not just their own.
-- That cross-teacher read deliberately does NOT widen per-row RLS (every
-- base table stays owner-scoped). Instead a single SECURITY DEFINER RPC,
-- school_classes(), returns the school's classes ONLY to a caller whose
-- profile is hod/slt — the dashboard then aggregates the retrieval mastery
-- per class in the app layer (reusing class_weak_topics), exactly like the
-- teacher tools do.
--
-- ROLE ASSIGNMENT (pilot): school_id + school_role are set out-of-band (by
-- you, via SQL/service role) — there is intentionally no self-serve policy
-- to grant yourself SLT. A proper invite/claim flow is a later step.
-- =====================================================================

-- ---------------------------------------------------------------------
-- schools: a school (or, later, a MAT member school).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  urn        text,                       -- DfE Unique Reference Number (optional)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS schools_set_updated_at ON public.schools;
CREATE TRIGGER schools_set_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
-- A member of the school can read their school row (name for the dashboard header).
DROP POLICY IF EXISTS schools_member_read ON public.schools;
CREATE POLICY schools_member_read ON public.schools
  FOR SELECT TO authenticated
  USING (id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT ON public.schools TO authenticated;

-- ---------------------------------------------------------------------
-- profiles: school membership + staff role for the dashboard gate.
-- (profiles is an existing table; we only add columns.)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_role text NOT NULL DEFAULT 'member'
    CHECK (school_role IN ('member','hod','slt'));

COMMENT ON COLUMN public.profiles.school_role IS
  'Dashboard access: member = none, hod = head of department, slt = senior leadership. '
  'hod/slt can see school-wide aggregates via school_classes(). Assigned out-of-band for now.';

CREATE INDEX IF NOT EXISTS idx_profiles_school ON public.profiles(school_id);

-- ---------------------------------------------------------------------
-- school_classes(): the only cross-teacher read. SECURITY DEFINER so it
-- can see other teachers' classes, but it returns rows ONLY when the
-- caller is hod/slt with a school — and only classes whose teacher is in
-- the SAME school. No personal pupil data here, just class metadata +
-- the retrieval class ids the dashboard aggregates against.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_classes()
RETURNS TABLE (
  class_id uuid, name text, year_group int, discipline text, tier text,
  teacher_id uuid, teacher_name text, retrieval_class_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT p.school_id, p.school_role INTO v_school, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_school IS NULL OR v_role NOT IN ('hod','slt') THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.year_group, c.discipline::text, c.tier,
         c.teacher_id, tp.full_name, c.retrieval_class_ids
  FROM public.classes c
  JOIN public.profiles tp ON tp.id = c.teacher_id
  WHERE tp.school_id = v_school
    AND c.archived = false
  ORDER BY c.year_group, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_classes() TO authenticated;

COMMENT ON FUNCTION public.school_classes() IS
  'School-wide class list for the SLT/HOD dashboard. Returns rows only to hod/slt callers, scoped to their own school. Non-personal (class metadata only).';
