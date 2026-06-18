-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Close a re-opened cross-school leak. 20260615_08 made topic_preview_questions
-- anon-executable (the ScienceKit lesson-page embed gets partitioned storage, so
-- the viewer's retrieval login can't be relied on) and SECURITY DEFINER — but it
-- returned EVERY question for the topic regardless of the `shared` flag, bypassing
-- the can_view_question() mixed-visibility model that 20260614_05 introduced. That
-- exposed a private (unshared) question's question_text / image_url to anyone
-- holding a topic UUID (those UUIDs appear in the embed URLs). model_answer was
-- already excluded, but question text is still IP.
--
-- Fix: only the shared/central-bank questions are previewable anonymously. This
-- matches what an anonymous caller would see through can_view_question() anyway
-- (no auth.uid() => only the `shared` branch can be true). Teachers' private
-- questions are no longer visible through the open embed; the authed top-level app
-- (where RLS + can_view_question apply) is unchanged.
create or replace function public.topic_preview_questions(p_topic_id uuid)
returns table(id uuid, question_text text, marks int, image_url text)
language sql
security definer
set search_path = public
as $$
  select q.id, q.question_text, q.marks, q.image_url
  from public.questions q
  where q.topic_id = p_topic_id
    and q.archived = false
    and q.shared = true        -- only the shared bank is previewable anonymously
  order by q.difficulty asc, q.created_at asc;
$$;

comment on function public.topic_preview_questions is
  'Read-only preview of SHARED questions only (no model_answer) for the lesson-page embed. Anon-executable. Private questions are excluded — see 20260618_01.';

grant execute on function public.topic_preview_questions(uuid) to anon, authenticated;
