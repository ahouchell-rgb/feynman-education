-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Exam-data feedforward. The retrieval feedforward loop (class_unit_gaps /
-- class_weak_topics) is built from RETRIEVAL practice. This adds the past-paper
-- equivalent: a class's weakest TOPICS by marks lost on exam questions, aggregated
-- from paper_responses -> paper_questions.topic_id (the exam questions are
-- topic-tagged). Same row shape as the retrieval gaps RPCs (topic_id, topic_name,
-- pct_correct, marked, students) so it plugs straight into the feynman feedforward UI.
--
-- GATING: unlike the legacy class_unit_gaps (x-sciencekit-key secret, server-only),
-- this is gated by the CALLER'S IDENTITY so the Phase-3 feynman client can call it
-- directly under the teacher's JWT — teacher-of-the-class OR moderator OR the
-- teacher's HoD. Non-personal aggregates only (no pupil identities / answers).
create or replace function public.class_paper_gaps(
  p_class_id uuid, p_limit int default 6, p_min_responses int default 3)
returns table(topic_id uuid, topic_name text, pct_correct numeric, marked int, students int)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id as topic_id, t.name as topic_name,
         round(100.0 * sum(coalesce(pr.marks_awarded, 0)) / nullif(sum(coalesce(pr.marks_max, 0)), 0), 0) as pct_correct,
         count(*)::int as marked,
         count(distinct a.student_id)::int as students
  from public.paper_responses pr
  join public.paper_attempts a on a.id = pr.attempt_id
  join public.paper_questions q on q.id = pr.paper_question_id
  join public.topics t on t.id = q.topic_id
  where a.class_id = p_class_id
    and a.submitted_at is not null
    and (
      public.is_moderator()
      or exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                 where c.id = p_class_id and tp.hod_id = auth.uid())
    )
  group by t.id, t.name
  having sum(coalesce(pr.marks_max, 0)) > 0 and count(*) >= p_min_responses
  order by pct_correct asc, marked desc
  limit p_limit;
$$;

comment on function public.class_paper_gaps is
  'A class''s weakest topics by past-paper marks lost (aggregate, non-personal). Identity-gated (teacher-of-class/HoD/moderator) for the Phase-3 feynman client. Exam equivalent of class_unit_gaps.';

revoke all on function public.class_paper_gaps(uuid, int, int) from public, anon;
grant execute on function public.class_paper_gaps(uuid, int, int) to authenticated;
