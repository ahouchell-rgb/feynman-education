-- ─── RLS regression tests ───────────────────────────────────────────────────
-- Proves row-level-security boundaries hold. Each block impersonates a real user
-- (via role + request.jwt.claims, exactly how Supabase evaluates auth.uid()) and
-- raises on any violation. Fixtures are discovered dynamically, so it's portable.
--
-- Run against a test/shadow DB (or prod — every check only reads and the role
-- switch is transaction-local):
--     psql "$DATABASE_URL" -f tests/rls_test.sql
-- Exit code is non-zero if any EXCEPTION fires. WARNINGs flag known-but-unfixed gaps.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

-- 1) Student response isolation: a student must see ONLY their own responses,
--    never a classmate's — even within the same class.
do $$
declare a uuid; b uuid; leaked int; own int; total int;
begin
  select cm1.student_id, cm2.student_id into a, b
  from class_members cm1
  join class_members cm2 on cm2.class_id = cm1.class_id and cm2.student_id <> cm1.student_id
  limit 1;
  if a is null then raise notice 'SKIP: no class with two students'; return; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into leaked from responses where student_id = b;
  select count(*) into own    from responses where student_id = a;
  select count(*) into total  from responses;
  reset role;

  if leaked <> 0 then raise exception 'FAIL: student % can read % of classmate %''s responses', a, leaked, b; end if;
  if total <> own then raise exception 'FAIL: student % sees % responses, only % are own', a, total, own; end if;
  raise notice 'PASS: student response isolation (own=%, classmate-visible=0)', own;
end $$;

-- 2) Anonymous (no JWT) users must not read student responses at all.
do $$
declare visible int;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into visible from responses;
  reset role;
  if visible <> 0 then raise exception 'FAIL: anon can read % responses', visible; end if;
  raise notice 'PASS: anonymous users see 0 responses';
end $$;

-- 3) Teacher scoping: a teacher can read responses for a class they teach.
do $$
declare t uuid; cls uuid; visible int;
begin
  select c.teacher_id, c.id into t, cls
  from classes c join responses r on r.class_id = c.id
  limit 1;
  if t is null then raise notice 'SKIP: no class with responses'; return; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  select count(*) into visible from responses where class_id = cls;
  reset role;
  if visible = 0 then raise exception 'FAIL: teacher % cannot read responses for own class %', t, cls; end if;
  raise notice 'PASS: teacher reads own class responses (visible=%)', visible;
end $$;

-- 4) Profiles PII exposure — HARD GATE.
--    profiles_select is scoped via can_view_profile(id) (own + teacher's students
--    + HoD's dept + moderator) and granted to `authenticated` only, so a student
--    must see only their own profile — never another pupil's name/email.
do $$
declare a uuid; others int;
begin
  select student_id into a from class_members limit 1;
  if a is null then raise notice 'SKIP: no students'; return; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into others from profiles where id <> a;
  reset role;
  if others > 0 then raise exception 'FAIL: student % can read % other profiles (names + emails)', a, others; end if;
  raise notice 'PASS: profile read access is scoped to self/permitted';
end $$;

-- 5) Profiles privilege-escalation — HARD GATE.
--    A signed-in user must NOT be able to write their own role/hod_id/school_id
--    (those are changed only by the manage-student edge function via service role).
--    Otherwise a pupil could PATCH role->'moderator' and read everyone's PII,
--    defeating test 4. We assert the column UPDATE grants are revoked.
do $$
declare leaks text;
begin
  select string_agg(col, ', ') into leaks
  from (values ('role'), ('hod_id'), ('school_id')) as c(col)
  where has_column_privilege('authenticated', 'public.profiles', c.col, 'UPDATE');
  if leaks is not null then
    raise exception 'FAIL: authenticated can UPDATE privileged profile column(s): %', leaks;
  end if;
  raise notice 'PASS: privileged profile columns (role/hod_id/school_id) are not client-writable';
end $$;

-- 6) Grade integrity — PENDING GATE (warning until the lock-in migration runs).
--    Once the client records via the mark-answer edge function and
--    db/migrations/20260614_02_grade_integrity_lockin.sql has been applied, the
--    browser must NOT be able to INSERT responses directly (it would let a pupil
--    forge is_correct / marks_awarded). Flip RAISE WARNING -> RAISE EXCEPTION
--    after applying that migration to make this a hard gate.
do $$
begin
  if has_table_privilege('authenticated', 'public.responses', 'INSERT') then
    raise warning 'PENDING: authenticated can still INSERT responses directly. Apply db/migrations/20260614_02_grade_integrity_lockin.sql once the new client is live, then make this a hard assertion.';
  else
    raise notice 'PASS: responses are written only by the mark-answer function (service role)';
  end if;
end $$;
