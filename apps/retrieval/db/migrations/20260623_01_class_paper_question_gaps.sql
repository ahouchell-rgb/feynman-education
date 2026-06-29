-- STATUS: APPLIED (2026-06-23) to project uvzukwoxqhcxaxtzrziy.
--
-- Phase 3 of the feedforward feature: auto-suggest the struggled questions from a
-- class's ACTUAL marked results. class_paper_gaps (20260618_09) aggregates to TOPIC
-- level; this is the per-QUESTION equivalent for a single paper, so the Feedforward
-- panel can pre-tick the questions a class scored lowest on. Same identity gate as
-- class_paper_gaps (teacher-of-class OR the teacher's HoD OR moderator); aggregate
-- only (no pupil identities / answers). Authenticated-execute; anon revoked.
create or replace function public.class_paper_question_gaps(
  p_class_id uuid, p_paper_id uuid, p_min_attempts int default 1)
returns table(paper_question_id uuid, question_label text, sort_order int, pct numeric, attempts int)
language sql stable security definer set search_path = public, pg_temp as $$
  select q.id as paper_question_id, q.question_label, q.sort_order,
         round(100.0 * sum(coalesce(pr.marks_awarded, 0)) / nullif(sum(coalesce(pr.marks_max, 0)), 0), 0) as pct,
         count(*)::int as attempts
  from public.paper_responses pr
  join public.paper_attempts a on a.id = pr.attempt_id
  join public.paper_questions q on q.id = pr.paper_question_id
  where a.class_id = p_class_id
    and a.paper_id = p_paper_id
    and a.submitted_at is not null
    and (
      public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  group by q.id, q.question_label, q.sort_order
  having sum(coalesce(pr.marks_max, 0)) > 0 and count(*) >= p_min_attempts
  order by pct asc, q.sort_order asc;
$$;

comment on function public.class_paper_question_gaps is
  'Per-question average score (%) for a class on one paper, weakest first (aggregate, non-personal). Identity-gated like class_paper_gaps. Feeds the feedforward auto-suggest. See 20260623_01.';

revoke all on function public.class_paper_question_gaps(uuid, uuid, int) from public, anon;
grant execute on function public.class_paper_question_gaps(uuid, uuid, int) to authenticated;
