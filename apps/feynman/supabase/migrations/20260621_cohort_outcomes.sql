-- =====================================================================
-- Feynman Education — Cohort outcomes (efficacy / outcomes-evidence layer)
-- Applied to prod: (pending)
--
-- SLT/MAT renewals hinge on "did our mastery work translate to outcomes?".
-- The snapshot tables already give a mastery TREND; this lets SLT record the
-- REAL results to correlate against it (e.g. "Y11 mock pass rate = 68%"), so
-- the Impact view + governors export can show mastery alongside outcomes.
--
-- School-scoped, hod/slt-gated for write (reuses the school_role pattern from
-- school_classes()); any school member may read their own school's outcomes.
-- No pupil-level data: these are cohort-level aggregates only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cohort_outcomes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label       text NOT NULL,                 -- e.g. "Y11 mock pass rate"
  term        text,                          -- e.g. "Autumn 2025" / "Spring"
  metric      text,                          -- e.g. "pass rate %" / "grade 4+ %"
  value       numeric NOT NULL,              -- e.g. 68
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_school
  ON public.cohort_outcomes(school_id, recorded_at DESC);

ALTER TABLE public.cohort_outcomes ENABLE ROW LEVEL SECURITY;

-- Read: any member of the school may see its recorded outcomes.
DROP POLICY IF EXISTS cohort_outcomes_member_read ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_member_read ON public.cohort_outcomes
  FOR SELECT TO authenticated
  USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));

-- Write (insert/update/delete): only hod/slt of THIS school. Mirrors the
-- school_role gate used by school_classes(); never cross-school.
DROP POLICY IF EXISTS cohort_outcomes_slt_write ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_slt_write ON public.cohort_outcomes
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT p.school_id FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.school_role IN ('hod','slt'))
  )
  WITH CHECK (
    school_id = (SELECT p.school_id FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.school_role IN ('hod','slt'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_outcomes TO authenticated;

COMMENT ON TABLE public.cohort_outcomes IS
  'SLT-recorded cohort outcomes (e.g. mock pass rates) to correlate with the '
  'mastery trend. School-scoped; hod/slt write, member read. No pupil-level data.';
