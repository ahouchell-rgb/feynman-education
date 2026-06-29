-- =====================================================================
-- Houchell Education — Home (D2C) + school-sponsored access (NOW plan · E8)
-- Applied to prod: (pending)
--
-- Adds the consumer "Home" layer on the existing parent token-portal:
--   • schools.home_sponsored — an slt can make Home free for their parents
--     (school-sponsored funnel), set via a SECURITY DEFINER RPC.
--   • guardian_student.home_subscribed — set by the parent-paid funnel later.
--   • guardian_student.target_grade — the parent's target for the child, shown
--     in the Home target tracker.
-- Home is unlocked for a child when their school sponsors it OR the guardian
-- has subscribed.
-- =====================================================================

ALTER TABLE public.schools          ADD COLUMN IF NOT EXISTS home_sponsored  boolean NOT NULL DEFAULT false;
ALTER TABLE public.guardian_student ADD COLUMN IF NOT EXISTS home_subscribed boolean NOT NULL DEFAULT false;
ALTER TABLE public.guardian_student ADD COLUMN IF NOT EXISTS target_grade    text;

-- An slt toggles Home sponsorship for their whole school.
CREATE OR REPLACE FUNCTION public.set_school_home_sponsored(p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school uuid; v_role text;
BEGIN
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = auth.uid();
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a senior leader can change this'; END IF;
  UPDATE public.schools SET home_sponsored = p_on WHERE id = v_school;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_school_home_sponsored(boolean) TO authenticated;

COMMENT ON COLUMN public.schools.home_sponsored IS 'When true, the parent Home product is free for this school''s parents (school-sponsored D2C).';
