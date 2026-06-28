-- =====================================================================
-- Feynman Education — Per-objective mastery from assessments (NOW plan · P2 #9)
-- Applied to prod: (pending)
--
-- Blends the SECOND data source — common-assessment QLA — into the mastery
-- graph at the OBJECTIVE level, so dashboards can show "mastery per objective"
-- from assessment + retrieval together (today the SLT/trust panels are
-- retrieval-only). Assessment marks are owner-scoped; these SECURITY DEFINER
-- RPCs are the only cross-teacher reads and answer ONLY role-holders, scoped to
-- their own school/trust. Non-personal: per-objective aggregates only, gated
-- behind a minimum mark count so a single pupil can't be inferred.
--
-- Depends on: 20260620_subject_foundation (objectives/subjects),
--             20260621_assessments (assessment_questions.objective_id + marks),
--             20260620_schools_roles / 20260620_trusts_mat (roles).
-- =====================================================================

-- ---------------------------------------------------------------------
-- school_objective_mastery(p_min_marked): per-objective assessment mastery
-- across the caller's school. hod/slt only. Each row blends every marked
-- question tagged with that objective into one average percentage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_objective_mastery(p_min_marked int DEFAULT 5)
RETURNS TABLE (
  objective_id  uuid,
  objective     text,
  code          text,
  subject_slug  text,
  strand        text,
  pct           int,
  marked        bigint,
  students      bigint,
  teachers      bigint
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
  SELECT o.id, o.title, o.code, sub.slug, st.name,
         ROUND(100.0 * SUM(m.marks) / NULLIF(SUM(q.max_marks), 0))::int AS pct,
         COUNT(m.id) AS marked,
         COUNT(DISTINCT m.student_ref) AS students,
         COUNT(DISTINCT q.teacher_id) AS teachers
  FROM public.assessment_marks m
  JOIN public.assessment_questions q ON q.id = m.question_id
  JOIN public.objectives o ON o.id = q.objective_id
  LEFT JOIN public.subjects sub ON sub.id = o.subject_id
  LEFT JOIN public.strands  st  ON st.id  = o.strand_id
  JOIN public.profiles tp ON tp.id = q.teacher_id
  WHERE tp.school_id = v_school
    AND q.objective_id IS NOT NULL
    AND q.max_marks > 0
  GROUP BY o.id, o.title, o.code, sub.slug, st.name
  HAVING COUNT(m.id) >= GREATEST(p_min_marked, 1)
  ORDER BY pct ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_objective_mastery(int) TO authenticated;

COMMENT ON FUNCTION public.school_objective_mastery(int) IS
  'Per-objective assessment mastery for the SLT/HOD dashboard. hod/slt only, own school. Non-personal aggregates, min-marked gated.';

-- ---------------------------------------------------------------------
-- trust_objective_mastery(p_min_marked): the same one level up — per-objective
-- assessment mastery across every school in the caller's trust. trust_lead only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trust_objective_mastery(p_min_marked int DEFAULT 5)
RETURNS TABLE (
  objective_id  uuid,
  objective     text,
  code          text,
  subject_slug  text,
  strand        text,
  pct           int,
  marked        bigint,
  students      bigint,
  schools       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trust uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT p.trust_id, p.trust_role INTO v_trust, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_trust IS NULL OR v_role <> 'trust_lead' THEN RETURN; END IF;

  RETURN QUERY
  SELECT o.id, o.title, o.code, sub.slug, st.name,
         ROUND(100.0 * SUM(m.marks) / NULLIF(SUM(q.max_marks), 0))::int AS pct,
         COUNT(m.id) AS marked,
         COUNT(DISTINCT m.student_ref) AS students,
         COUNT(DISTINCT s.id) AS schools
  FROM public.assessment_marks m
  JOIN public.assessment_questions q ON q.id = m.question_id
  JOIN public.objectives o ON o.id = q.objective_id
  LEFT JOIN public.subjects sub ON sub.id = o.subject_id
  LEFT JOIN public.strands  st  ON st.id  = o.strand_id
  JOIN public.profiles tp ON tp.id = q.teacher_id
  JOIN public.schools  s  ON s.id  = tp.school_id
  WHERE s.trust_id = v_trust
    AND q.objective_id IS NOT NULL
    AND q.max_marks > 0
  GROUP BY o.id, o.title, o.code, sub.slug, st.name
  HAVING COUNT(m.id) >= GREATEST(p_min_marked, 1)
  ORDER BY pct ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trust_objective_mastery(int) TO authenticated;

COMMENT ON FUNCTION public.trust_objective_mastery(int) IS
  'Per-objective assessment mastery for the MAT dashboard. trust_lead only, own trust. Non-personal aggregates, min-marked gated.';
