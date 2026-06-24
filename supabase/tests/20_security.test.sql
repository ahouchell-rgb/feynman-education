-- =====================================================================
-- Security surface tests — RLS isolation + SECURITY DEFINER role gates.
--
-- Run as the superuser that owns the schema (which BYPASSES RLS), but every
-- assertion first SET LOCAL ROLE authenticated and sets request.jwt.claim.sub,
-- so the checks run with RLS enforced as a real signed-in user would see it.
-- Any failed assertion RAISEs; psql is run with ON_ERROR_STOP=1 so the suite
-- exits non-zero on the first failure.
-- =====================================================================
\set ON_ERROR_STOP on

-- ── fixtures (as owner; RLS bypassed for setup) ──────────────────────
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),  -- teacher A (no school)
  ('22222222-2222-2222-2222-222222222222'),  -- teacher B (no school)
  ('33333333-3333-3333-3333-333333333333'),  -- SLT of school S
  ('44444444-4444-4444-4444-444444444444');  -- member of school S

INSERT INTO public.schools (id, name) VALUES
  ('55555555-5555-5555-5555-555555555555', 'Test School');

INSERT INTO public.profiles (id, school_id, school_role) VALUES
  ('11111111-1111-1111-1111-111111111111', NULL, 'member'),
  ('22222222-2222-2222-2222-222222222222', NULL, 'member'),
  ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'slt'),
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'member');

INSERT INTO public.classes (id, teacher_id, name, year_group, discipline, key_stage, academic_year) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A''s class', 10, 'biology', 'ks4', '2026-27'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'M''s class', 9,  'physics', 'ks3', '2026-27');

-- ─────────────────────────────────────────────────────────────────────
-- TEST 1 — classes RLS: owner can read their own row.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SELECT count(*) INTO n FROM public.classes WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: owner A should read own class (got %)', n; END IF;
  RAISE NOTICE 'TEST 1 PASSED: owner reads own class';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 2 — classes RLS: a different teacher CANNOT read another's row.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  SELECT count(*) INTO n FROM public.classes WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 2 FAILED: teacher B must NOT read A''s class (cross-tenant leak! got %)', n; END IF;
  RAISE NOTICE 'TEST 2 PASSED: cross-teacher read is blocked';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 3 — classes RLS: a different teacher CANNOT update another's row.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  UPDATE public.classes SET name = 'hijacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED: teacher B updated A''s class (% rows)', n; END IF;
  RAISE NOTICE 'TEST 3 PASSED: cross-teacher write is blocked';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 4 — school_classes() definer gate: a plain member sees nothing.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  SELECT count(*) INTO n FROM public.school_classes();
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 4 FAILED: a member must get no school-wide classes (got %)', n; END IF;
  RAISE NOTICE 'TEST 4 PASSED: non-privileged member gets no cross-teacher rows';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 5 — school_classes() definer gate: an SLT sees their school's classes.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  SELECT count(*) INTO n FROM public.school_classes()
    WHERE class_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: SLT should see the member''s class in their school (got %)', n; END IF;
  RAISE NOTICE 'TEST 5 PASSED: SLT sees their school''s classes';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 6 — privilege escalation: a member CANNOT promote themselves to slt.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE raised boolean := false; role_after text;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  BEGIN
    PERFORM public.set_school_member_role('44444444-4444-4444-4444-444444444444', 'slt');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'TEST 6 FAILED: member self-promotion did not raise'; END IF;
  PERFORM set_config('role', 'authenticated', true);  -- definer call reset our local role
  RESET ROLE;
  SELECT school_role INTO role_after FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  IF role_after <> 'member' THEN RAISE EXCEPTION 'TEST 6 FAILED: member role escalated to %', role_after; END IF;
  RAISE NOTICE 'TEST 6 PASSED: self-promotion is rejected';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 7 — SLT cannot change the role of someone in a DIFFERENT school.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE raised boolean := false;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  BEGIN
    -- teacher B is in no school → out of the SLT's scope.
    PERFORM public.set_school_member_role('22222222-2222-2222-2222-222222222222', 'hod');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'TEST 7 FAILED: SLT changed an out-of-school teacher''s role'; END IF;
  RAISE NOTICE 'TEST 7 PASSED: cross-school role change is rejected';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 8 — SLT CAN promote a member of their own school (happy path).
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE role_after text;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  PERFORM public.set_school_member_role('44444444-4444-4444-4444-444444444444', 'hod');
  RESET ROLE;
  SELECT school_role INTO role_after FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  IF role_after <> 'hod' THEN RAISE EXCEPTION 'TEST 8 FAILED: SLT promotion did not apply (role=%)', role_after; END IF;
  RAISE NOTICE 'TEST 8 PASSED: SLT promotes a same-school member';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 9 — guardrail: every base table in `public` has RLS enabled.
-- A table that ships without RLS is a tenant-isolation hole the moment
-- Supabase's default grants expose it. New tables must opt IN to RLS.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE leaky text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO leaky
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
  IF leaky IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 9 FAILED: public tables without RLS enabled: %', leaky;
  END IF;
  RAISE NOTICE 'TEST 9 PASSED: all public tables have RLS enabled';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 10 — pupil leaver lifecycle: purge_left_pupils() deletes a pupil who
-- dropped off the latest sync and is past retention, keeps a current pupil,
-- and writes a (non-identifying) deletion record.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE purged int; n int;
BEGIN
  -- A recent successful sync for the test school.
  INSERT INTO public.mis_sync_runs (school_id, status, finished_at)
    VALUES ('55555555-5555-5555-5555-555555555555', 'ok', now());
  -- One current pupil (refreshed now) and one leaver (synced 400 days ago).
  INSERT INTO public.mis_students (school_id, mis_id, full_name, synced_at) VALUES
    ('55555555-5555-5555-5555-555555555555', 'cur-1',  'Current Pupil', now()),
    ('55555555-5555-5555-5555-555555555555', 'left-1', 'Left Pupil',    now() - interval '400 days');
  INSERT INTO public.mis_class_students (school_id, class_mis_id, student_mis_id) VALUES
    ('55555555-5555-5555-5555-555555555555', 'cls-1', 'left-1');
  INSERT INTO public.mis_contacts (school_id, mis_id, student_mis_id, full_name) VALUES
    ('55555555-5555-5555-5555-555555555555', 'con-1', 'left-1', 'Left Parent');

  purged := public.purge_left_pupils(365, 8);
  IF purged <> 1 THEN RAISE EXCEPTION 'TEST 10 FAILED: expected 1 purged, got %', purged; END IF;

  SELECT count(*) INTO n FROM public.mis_students
    WHERE school_id = '55555555-5555-5555-5555-555555555555' AND mis_id = 'left-1';
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 10 FAILED: leaver not deleted'; END IF;

  SELECT count(*) INTO n FROM public.mis_students
    WHERE school_id = '55555555-5555-5555-5555-555555555555' AND mis_id = 'cur-1';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 10 FAILED: current pupil wrongly deleted'; END IF;

  SELECT count(*) INTO n FROM public.mis_class_students WHERE student_mis_id = 'left-1';
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 10 FAILED: leaver class membership not deleted'; END IF;

  SELECT count(*) INTO n FROM public.pupil_purge_log
    WHERE school_id = '55555555-5555-5555-5555-555555555555' AND mis_id = 'left-1';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 10 FAILED: no deletion record written'; END IF;

  RAISE NOTICE 'TEST 10 PASSED: leaver purged, current pupil kept, deletion logged';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- TEST 11 — lifecycle safety: a school whose latest successful sync is STALE
-- is skipped (a broken sync must not be read as "everyone left").
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE purged int; n int;
BEGIN
  -- Wipe prior sync rows; make the only successful sync 30 days old (stale).
  DELETE FROM public.mis_sync_runs WHERE school_id = '55555555-5555-5555-5555-555555555555';
  INSERT INTO public.mis_sync_runs (school_id, status, finished_at)
    VALUES ('55555555-5555-5555-5555-555555555555', 'ok', now() - interval '30 days');
  INSERT INTO public.mis_students (school_id, mis_id, full_name, synced_at) VALUES
    ('55555555-5555-5555-5555-555555555555', 'left-2', 'Another Leaver', now() - interval '500 days');

  purged := public.purge_left_pupils(365, 8);  -- max sync age 8d → school skipped
  SELECT count(*) INTO n FROM public.mis_students
    WHERE school_id = '55555555-5555-5555-5555-555555555555' AND mis_id = 'left-2';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 11 FAILED: purged on a stale sync (unsafe)'; END IF;
  RAISE NOTICE 'TEST 11 PASSED: stale-sync school is skipped';
END $$;

SELECT 'ALL SECURITY TESTS PASSED' AS result;
