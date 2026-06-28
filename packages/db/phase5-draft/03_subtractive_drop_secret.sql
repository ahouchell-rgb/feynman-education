-- PHASE 5 — STEP 4 (SUBTRACTIVE), DRAFT, NOT APPLIED.
-- Run ONLY after 01 + 02 are applied, the app has dropped the x-sciencekit-key header on these
-- paths, and the school/trust/teacher dashboards are verified working on identity alone.
-- This removes the secret OR-branch from the 5 RPCs that had it; gate becomes just the helper.
-- class_paper_gaps already had no secret (02 left it helper-only) — nothing to do here.
-- After applying, ROTATE the secret:  update private.app_config set value = <new> where key='sciencekit_key';
-- (cron/parent paths use their own secret-gated RPCs, not these — confirm before rotating.)

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
    and public.can_read_class_analytics(p_class_id)
  order by om.pct_correct asc, om.marked desc limit p_limit;
$$;

create or replace function public.class_unit_gaps(p_class_id uuid, p_unit_id text)
returns table(topic_id uuid, topic_name text, pct_correct numeric, marked integer, students integer, last_seen date, objective_id uuid, objective_title text)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select om.topic_id, om.topic_name, om.pct_correct, om.marked::int, om.students::int, om.last_seen, om.objective_id, om.objective_title
  from public.objective_mastery om
  where om.class_id = p_class_id and om.unit_id = p_unit_id and om.marked >= 5
    and public.can_read_class_analytics(p_class_id)
  order by om.pct_correct asc, om.marked desc limit 12;
$$;

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
    and public.can_read_class_analytics(p_class_id)
  group by u.objective_id, o.title having sum(u.mx)>0
  order by pct asc nulls last, marks desc limit p_limit;
$$;

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
    and public.can_read_student_analytics(p_student_id)
  group by t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
  order by pct_correct asc, marked desc limit p_limit;
$$;

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
    and public.can_read_class_pii(p_class_id)
  group by r.student_id, coalesce(p.display_name, p.full_name, 'Pupil'), t.id, t.name, t.subject_id
  having count(*) filter (where r.is_correct is not null) > 0
     and round(100.0 * count(*) filter (where r.is_correct) / nullif(count(*) filter (where r.is_correct is not null),0),0) <= p_threshold
  order by pct_correct asc, marked desc;
$$;
