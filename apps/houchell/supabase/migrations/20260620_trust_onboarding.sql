-- =====================================================================
-- Houchell Education — Self-serve trust (MAT) onboarding (Build 4 follow-up)
-- Applied to prod: (pending)
--
-- Mirrors school onboarding one level up. A school's slt can CREATE a trust
-- (becoming its trust_lead, and linking their own school) or LINK their school
-- to an existing trust with a code. SECURITY DEFINER RPCs enforce the rules —
-- trust_lead is only granted by creating a trust, never self-assigned.
-- =====================================================================

ALTER TABLE public.trusts ADD COLUMN IF NOT EXISTS join_code text;
UPDATE public.trusts SET join_code = upper(substr(md5(random()::text), 1, 6)) WHERE join_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusts_join_code ON public.trusts(join_code);

-- ── create_trust: make a trust, become trust_lead, link your own school ────
CREATE OR REPLACE FUNCTION public.create_trust(p_name text)
RETURNS public.trusts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_trust public.trusts;
  v_school uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'trust name is required'; END IF;
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a school senior leader can create a trust'; END IF;

  LOOP
    v_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.trusts WHERE join_code = v_code);
  END LOOP;

  INSERT INTO public.trusts (name, join_code) VALUES (trim(p_name), v_code) RETURNING * INTO v_trust;
  UPDATE public.schools SET trust_id = v_trust.id WHERE id = v_school;
  UPDATE public.profiles SET trust_id = v_trust.id, trust_role = 'trust_lead' WHERE id = v_uid;
  RETURN v_trust;
END;
$$;

-- ── link_school_to_trust: attach your school to an existing trust by code ──
CREATE OR REPLACE FUNCTION public.link_school_to_trust(p_code text)
RETURNS public.trusts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trust public.trusts;
  v_school uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a school senior leader can link a school'; END IF;
  SELECT * INTO v_trust FROM public.trusts WHERE join_code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid join code'; END IF;

  UPDATE public.schools SET trust_id = v_trust.id WHERE id = v_school;
  -- Give the linking slt trust membership (member) so they can see the trust
  -- name; leadership stays with whoever created the trust.
  UPDATE public.profiles SET trust_id = v_trust.id WHERE id = v_uid;
  RETURN v_trust;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trust(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_school_to_trust(text) TO authenticated;
