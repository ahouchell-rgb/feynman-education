-- Read-only question PREVIEW for the ScienceKit lesson-page embed
-- (src/app/topic/[id]/page.js). Anon-executable because an embedded iframe gets
-- partitioned storage, so the viewer's retrieval login can't be relied on.
-- DELIBERATELY EXCLUDES model_answer: an open endpoint returning answers would
-- let students harvest the mark scheme. Teachers see the questions; the real
-- answerable practice happens in the authed top-level app.
create or replace function public.topic_preview_questions(p_topic_id uuid)
returns table(id uuid, question_text text, marks int, image_url text)
language sql
security definer
set search_path = public
as $$
  select q.id, q.question_text, q.marks, q.image_url
  from public.questions q
  where q.topic_id = p_topic_id and q.archived = false
  order by q.difficulty asc, q.created_at asc;
$$;

comment on function public.topic_preview_questions is
  'Read-only question preview (no model_answer) for the lesson-page embed. Anon-executable.';

grant execute on function public.topic_preview_questions(uuid) to anon, authenticated;
