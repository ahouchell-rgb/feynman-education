-- =====================================================================
-- Feynman Education — Audit the privileged role RPCs (NOW plan · P0 #4)
-- Applied to prod: (pending)
--
-- The audit_log table existed but only the export/MIS routes wrote to it; the
-- MOST sensitive mutations — creating orgs, changing/removing members, linking
-- trusts — left no trail. This adds a log_audit() helper and recreates each
-- role/onboarding SECURITY DEFINER RPC to record who did what to whom.
--
-- log_audit() is SECURITY DEFINER so it can insert past the service-role-only
-- write policy; it always stamps actor_id = auth.uid() (never trusts a caller
-- argument), so the trail can't be forged.
--
-- Depends on: 20260621_audit_log, 20260620_school_onboarding,
--             20260620_school_members_manage, 20260620_trust_onboarding.
-- =====================================================================

-- ── log_audit: append one privileged-action row (actor = caller) ──────────
CREATE OR REPLACE FUNCTION public.log_audit(p_action text, p_target text DEFAULT NULL, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), p_action, p_target, COALESCE(p_detail, '{}'::jsonb));
END;
$$;
-- Callable by signed-in users, but only ever logs as themselves. Routes/RPCs use it.
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, jsonb) TO authenticated;

-- ── set_school_member_role + audit ───────────────────────────────────────
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
  v_prev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_role NOT IN ('member', 'hod', 'slt') THEN RAISE EXCEPTION 'invalid role'; END IF;
  SELECT school_id, school_role INTO v_school, v_role FROM public.profiles WHERE id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RAISE EXCEPTION 'only a senior leader can change roles'; END IF;
  SELECT school_id, school_role INTO v_tschool, v_prev FROM public.profiles WHERE id = p_target;
  IF v_tschool IS DISTINCT FROM v_school THEN RAISE EXCEPTION 'that teacher is not in your school'; END IF;
  UPDATE public.profiles SET school_role = p_role WHERE id = p_target;
  PERFORM public.log_audit('role.change', p_target::text,
    jsonb_build_object('school_id', v_school, 'from', v_prev, 'to', p_role));
END;
$$;

-- ── remove_school_member + audit ─────────────────────────────────────────
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
  PERFORM public.log_audit('member.remove', p_target::text, jsonb_build_object('school_id', v_school));
END;
$$;

-- ── create_school + audit ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_school(p_name text)
RETURNS public.schools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_school public.schools;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'school name is required'; END IF;

  LOOP
    v_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.schools WHERE join_code = v_code);
  END LOOP;

  INSERT INTO public.schools (name, join_code) VALUES (trim(p_name), v_code) RETURNING * INTO v_school;
  UPDATE public.profiles SET school_id = v_school.id, school_role = 'slt' WHERE id = v_uid;
  PERFORM public.log_audit('school.create', v_school.id::text, jsonb_build_object('name', v_school.name));
  RETURN v_school;
END;
$$;

-- ── join_school + audit ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_school(p_code text)
RETURNS public.schools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school public.schools;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_school FROM public.schools WHERE join_code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid join code'; END IF;

  UPDATE public.profiles
  SET school_id = v_school.id,
      school_role = CASE WHEN school_role = 'slt' AND school_id = v_school.id THEN 'slt' ELSE 'member' END
  WHERE id = v_uid;
  PERFORM public.log_audit('school.join', v_school.id::text, '{}'::jsonb);
  RETURN v_school;
END;
$$;

-- ── leave_school + audit ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_school()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT school_id INTO v_school FROM public.profiles WHERE id = v_uid;
  UPDATE public.profiles SET school_id = NULL, school_role = 'member' WHERE id = v_uid;
  PERFORM public.log_audit('school.leave', v_school::text, '{}'::jsonb);
END;
$$;

-- ── create_trust + audit ──────────────────────────────────────────────────
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
  PERFORM public.log_audit('trust.create', v_trust.id::text,
    jsonb_build_object('name', v_trust.name, 'school_id', v_school));
  RETURN v_trust;
END;
$$;

-- ── link_school_to_trust + audit ──────────────────────────────────────────
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
  UPDATE public.profiles SET trust_id = v_trust.id WHERE id = v_uid;
  PERFORM public.log_audit('trust.link', v_trust.id::text, jsonb_build_object('school_id', v_school));
  RETURN v_trust;
END;
$$;

COMMENT ON FUNCTION public.log_audit(text, text, jsonb) IS
  'Append one privileged-action row to audit_log, always stamped with the caller''s uid. Used by the role/onboarding RPCs.';
