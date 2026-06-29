-- =====================================================================
-- Houchell Education — School member management (onboarding follow-up)
-- Applied to prod: (pending)
--
-- Lets a school's slt manage their roster: promote a member to hod (or slt),
-- demote, or remove a teacher from the school. SECURITY DEFINER + slt-gated +
-- same-school checks, so the role surface stays controlled.
-- =====================================================================

-- ── set_school_member_role: change a colleague's role within your school ──
CREATE OR REPLACE FUNCTION public.set_school_member_role(p_target uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_tschool uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_role NOT IN ('member', 'hod', 'slt') THEN RAISE EXCEPTION 'invalid role'; END IF;
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a senior leader can change roles'; END IF;
  SELECT school_id INTO v_tschool FROM public.profiles WHERE id = p_target;
  IF v_tschool IS DISTINCT FROM v_school THEN RAISE EXCEPTION 'that teacher is not in your school'; END IF;
  UPDATE public.profiles SET school_role = p_role WHERE id = p_target;
END;
$$;

-- ── remove_school_member: detach a colleague from your school ─────────────
CREATE OR REPLACE FUNCTION public.remove_school_member(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_tschool uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_target = v_uid THEN RAISE EXCEPTION 'use leave_school to remove yourself'; END IF;
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a senior leader can remove staff'; END IF;
  SELECT school_id INTO v_tschool FROM public.profiles WHERE id = p_target;
  IF v_tschool IS DISTINCT FROM v_school THEN RAISE EXCEPTION 'that teacher is not in your school'; END IF;
  UPDATE public.profiles SET school_id = NULL, school_role = 'member' WHERE id = p_target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_school_member_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_school_member(uuid) TO authenticated;
