-- =====================================================================
-- Houchell Education — AI spend roll-up for org budgets (NOW plan · P1 #7)
-- Applied to prod: (pending)
--
-- Per-teacher daily caps already exist (daily_token_usage + the route checks).
-- This adds the ORG dimension: a SECURITY DEFINER roll-up of a school's
-- month-to-date token spend so a generator route can enforce a per-school
-- monthly budget (AI_ORG_MONTHLY_CAP_GBP) and protect gross margin at scale.
-- Returns a single non-personal aggregate (£ is derived app-side); answers only
-- a caller who belongs to a school, scoped to that school.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.school_ai_spend(p_since date)
RETURNS TABLE (input_tokens bigint, output_tokens bigint, requests bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT p.school_id INTO v_school FROM public.profiles p WHERE p.id = v_uid;
  IF v_school IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT COALESCE(SUM(u.input_tokens), 0)::bigint,
         COALESCE(SUM(u.output_tokens), 0)::bigint,
         COALESCE(SUM(u.request_count), 0)::bigint
  FROM public.daily_token_usage u
  JOIN public.profiles p ON p.id = u.teacher_id
  WHERE p.school_id = v_school
    AND u.day >= p_since;
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_ai_spend(date) TO authenticated;

COMMENT ON FUNCTION public.school_ai_spend(date) IS
  'Month-to-date token spend across the caller''s school (since p_since). School members only, own school. Non-personal aggregate for the per-org AI budget.';
