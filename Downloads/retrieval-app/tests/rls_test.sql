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

-- 4) Profiles PII exposure — KNOWN ISSUE (warning, not failure, until fixed).
--    Today profiles_select is `USING (true)` for role public, so any signed-in
--    user (and anon) can read every pupil's name + email. Once profiles_select
--    is scoped (own + teacher's students + HoD's dept + moderator), change the
--    RAISE WARNING below to RAISE EXCEPTION so this becomes a hard regression gate.
do $$
declare a uuid; others int;
begin
  select student_id into a from class_members limit 1;
  if a is null then raise notice 'SKIP: no students'; return; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into others from profiles where id <> a;
  reset role;
  if others > 0 then
    raise warning 'KNOWN ISSUE: student can read % other profiles (names + emails). Scope profiles_select, then make this a hard assertion.', others;
  else
    raise notice 'PASS: profile read access is scoped to self/permitted';
  end if;
end $$;
