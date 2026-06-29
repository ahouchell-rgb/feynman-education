-- =====================================================================
-- Houchell Education — Self-serve school onboarding (Build 2 follow-up)
-- Applied to prod: (pending)
--
-- Replaces hand-run SQL for school setup. A teacher can CREATE a school (and
-- become its slt) or JOIN one with a code (as a member). All mutations go
-- through SECURITY DEFINER RPCs that enforce the rules — there is deliberately
-- NO client-writable path to set your own school_role, so nobody can grant
-- themselves slt on a school they didn't create.
--
-- Trust model: an slt only ever sees aggregates of teachers who opted in by
-- entering that school's join code, so self-serve creation is safe.
-- =====================================================================

-- Shareable join code per school.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS join_code text;
UPDATE public.schools SET join_code = upper(substr(md5(random()::text), 1, 6)) WHERE join_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_join_code ON public.schools(join_code);

-- The owning slt (and members) can already read their school row (Build 2 RLS),
-- so join_code is visible to share. No new policy needed.

-- ── create_school: make a new school, become its slt ──────────────────────
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
  RETURN v_school;
END;
$$;

-- ── join_school: join an existing school by code, as a member ─────────────
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

  -- Joining by code never grants leadership; keep slt only if re-joining the
  -- same school you already lead.
  UPDATE public.profiles
  SET school_id = v_school.id,
      school_role = CASE WHEN school_role = 'slt' AND school_id = v_school.id THEN 'slt' ELSE 'member' END
  WHERE id = v_uid;
  RETURN v_school;
END;
$$;

-- ── leave_school: detach from the current school ──────────────────────────
CREATE OR REPLACE FUNCTION public.leave_school()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.profiles SET school_id = NULL, school_role = 'member' WHERE id = auth.uid();
END;
$$;

-- ── school_members: roster for the school's slt/hod ───────────────────────
CREATE OR REPLACE FUNCTION public.school_members()
RETURNS TABLE (id uuid, full_name text, school_role text)
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
  IF v_school IS NULL OR v_role NOT IN ('hod', 'slt') THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.school_role FROM public.profiles p WHERE p.school_id = v_school ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_school(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_school(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_school() TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_members() TO authenticated;
