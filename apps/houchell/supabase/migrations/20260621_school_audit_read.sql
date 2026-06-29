-- =====================================================================
-- Houchell Education — School audit read (NOW plan · P0 #4 follow-on)
-- Applied to prod: (pending)
--
-- The role/onboarding RPCs now write to audit_log, but base RLS only lets an
-- actor read their OWN rows — so a senior leader can't review who changed roles
-- in their school. This adds one role-gated SECURITY DEFINER read that returns
-- the school's recent privileged actions (with actor names) to slt only.
--
-- Depends on: 20260621_audit_log, 20260621_audit_role_rpcs.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.school_audit(p_limit int DEFAULT 50)
RETURNS TABLE (
  at         timestamptz,
  actor_id   uuid,
  actor_name text,
  action     text,
  target     text,
  detail     jsonb
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
  SELECT p.school_id, p.school_role INTO v_school, v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_school IS NULL OR v_role <> 'slt' THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.at, a.actor_id, ap.full_name, a.action, a.target, a.detail
  FROM public.audit_log a
  JOIN public.profiles ap ON ap.id = a.actor_id
  WHERE ap.school_id = v_school
    AND a.action IN ('role.change','member.remove','school.create','school.join','school.leave','trust.create','trust.link')
  ORDER BY a.at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_audit(int) TO authenticated;

COMMENT ON FUNCTION public.school_audit(int) IS
  'Recent privileged actions across the caller''s school, with actor names. slt only, own school. Powers the admin-activity viewer.';
