-- PHASE 5 — STEP 1 (ADDITIVE), DRAFT, NOT APPLIED.
-- CREATE OR REPLACE the 6 interactive RPCs so the gate becomes ( <existing secret> OR <helper> ).
-- Bodies are unchanged except the WHERE-gate. Because the helper is a superset of today's
-- identity access and the secret branch is preserved, this CANNOT break any current caller —
-- it only ADDS school/trust identity access. Run 01_gate_helpers.sql first.
-- After this + app drops the secret + verify, run 03 to remove the secret.

-- 1) class_weak_topics  (had secret)
create or replace function public.class_weak_topics(p_class_id uuid, p_limit integer default 5, p_min_marked integer default 8, p_subject text default null)
returns table(topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked integer, students integer)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select om.topic_id, om.topic_name, t.subject_id, om.pct_correct, om.marked::int, om.students::int
  from public.objective_mastery om
  join public.topics t on t.id = om.topic_id
  left join public.subjects s on s.id = t.subject_id
  where om.class_id = p_class_id and om.marked >= p_min_marked
    and (p_subject is null or s.slug = p_subject or s.name = p_subject)
    and ( nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key','') = (select value from private.app_config where key='sciencekit_key')
          or public.can_read_class_analytics(p_class_id) )
  order by om.pct_correct asc, om.marked desc limit p_limit;
$$;

-- 2) class_unit_gaps  (had secret)
create or replace function public.class_unit_gaps(p_class_id uuid, p_unit_id text)
returns table(topic_id uuid, topic_name text, pct_correct numeric, marked integer, students integer, last_seen date, objective_id uuid, objective_title text)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select om.topic_id, om.topic_name, om.pct_correct, om.marked::int, om.students::int, om.last_seen, om.objective_id, om.objective_title
  from public.objective_mastery om
  where om.class_id = p_class_id and om.unit_id = p_unit_id and om.marked >= 5
    and ( nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key','') = (select value from private.app_config where key='sciencekit_key')
          or public.can_read_class_analytics(p_class_id) )
  order by om.pct_correct asc, om.marked desc limit 12;
$$;

-- 3) class_objective_breakdown  (had secret)
create or replace function public.class_objective_breakdown(p_class_id uuid, p_unit_id text default null, p_limit integer default 50)
returns table(objective_id uuid, objective_title text, pct numeric, retrieval_pct numeric, paper_pct numeric, marks integer, pupils integer)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  with unified as (
    select r.student_id, tom.objective_id, (r.is_correct)::int as awarded, 1 as mx, 'r'::text as src
    from public.responses r join public.questions q on q.id=r.question_id join public.topic_objective_map tom on tom.topic_id=q.topic_id
    where r.class_id=p_class_id and r.is_correct is not null
    union all
    select a.student_id, tom.objective_id, coalesce(pr.marks_awarded,0), coalesce(pr.marks_max,0), 'p'
    from public.paper_responses pr join public.paper_attempts a on a.id=pr.attempt_id join public.paper_questions pq on pq.id=pr.paper_question_id join public.topic_objective_map tom on tom.topic_id=pq.topic_id
    where a.class_id=p_class_id and a.submitted_at is not null
  )
  select u.objective_id, o.title,
    round(100.0*sum(u.awarded)/nullif(sum(u.mx),0),0) as pct,
    round(100.0*sum(u.awarded) filter (where u.src='r')/nullif(sum(u.mx) filter (where u.src='r'),0),0) as retrieval_pct,
    round(100.0*sum(u.awarded) filter (where u.src='p')/nullif(sum(u.mx) filter (where u.src='p'),0),0) as paper_pct,
    sum(u.mx)::int as marks, count(distinct u.student_id)::int as pupils
  from unified u join public.objectives o on o.id=u.objective_id
  where (p_unit_id is null or o.unit_id=p_unit_id)
    and ( nullif(current_setting('request.headers',true)::json->>'x-sciencekit-key','')=(select value from private.app_config where key='sciencekit_key')
          or public.can_read_class_analytics(p_class_id) )
  group by u.objective_id, o.title having sum(u.mx)>0
  order by pct asc nulls last, marks desc limit p_limit;
$$;

-- 4) student_weak_topics  (had secret; STUDENT-scoped helper)
create or replace function public.student_weak_topics(p_student_id uuid, p_limit integer default 5, p_subject text default null)
returns table(topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked integer)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select t.id, t.name, t.subject_id,
         round(100.0 * count(*) filter (where r.is_correct) / nullif(count(*) filter (where r.is_correct is not null),0),0) as pct_correct,
         count(*) filter (where r.is_correct is not null)::int as marked
  from public.responses r
  join public.questions q on q.id=r.question_id
  join public.topics t on t.id=q.topic_id
  left join public.subjects s on s.id=t.subject_id
  where r.student_id=p_student_id and (p_subject is null or s.slug = p_subject or s.name=p_subject)
    and ( nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key','') = (select value from private.app_config where key='sciencekit_key')
          or public.can_read_student_analytics(p_student_id) )
  group by t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
  order by pct_correct asc, marked desc limit p_limit;
$$;

-- 5) class_intervention_list  (had secret; PII helper)
create or replace function public.class_intervention_list(p_class_id uuid, p_threshold integer default 50, p_subject text default null)
returns table(student_id uuid, student_name text, topic_id uuid, topic_name text, subject_id uuid, pct_correct numeric, marked integer)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select r.student_id, coalesce(p.display_name, p.full_name, 'Pupil') as student_name, t.id, t.name, t.subject_id,
         round(100.0 * count(*) filter (where r.is_correct) / nullif(count(*) filter (where r.is_correct is not null),0),0) as pct_correct,
         count(*) filter (where r.is_correct is not null)::int as marked
  from public.responses r
  join public.questions q on q.id=r.question_id
  join public.topics t on t.id=q.topic_id
  join public.profiles p on p.id=r.student_id
  left join public.subjects s on s.id=t.subject_id
  where r.class_id=p_class_id and (p_subject is null or s.slug = p_subject or s.name=p_subject)
    and ( nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key','') = (select value from private.app_config where key='sciencekit_key')
          or public.can_read_class_pii(p_class_id) )
  group by r.student_id, coalesce(p.display_name, p.full_name, 'Pupil'), t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
     and round(100.0 * count(*) filter (where r.is_correct) / nullif(count(*) filter (where r.is_correct is not null),0),0) <= p_threshold
  order by pct_correct asc, marked desc;
$$;

-- 6) class_paper_gaps  (NO secret today — already identity-only; just swap to the helper, which is a superset)
create or replace function public.class_paper_gaps(p_class_id uuid, p_limit integer default 6, p_min_responses integer default 3)
returns table(topic_id uuid, topic_name text, pct_correct numeric, marked integer, students integer)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select t.id as topic_id, t.name as topic_name,
         round(100.0 * sum(coalesce(pr.marks_awarded, 0)) / nullif(sum(coalesce(pr.marks_max, 0)), 0), 0) as pct_correct,
         count(*)::int as marked,
         count(distinct a.student_id)::int as students
  from public.paper_responses pr
  join public.paper_attempts a on a.id = pr.attempt_id
  join public.paper_questions q on q.id = pr.paper_question_id
  join public.topics t on t.id = q.topic_id
  where a.class_id = p_class_id and a.submitted_at is not null
    and ( public.can_read_class_analytics(p_class_id) )
  group by t.id, t.name
  having sum(coalesce(pr.marks_max, 0)) > 0 and count(*) >= p_min_responses
  order by pct_correct asc, marked desc limit p_limit;
$$;
