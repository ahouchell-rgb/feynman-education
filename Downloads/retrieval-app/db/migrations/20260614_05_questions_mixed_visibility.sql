-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
--
-- Mixed content model. questions_select was USING(true) — every signed-in user
-- could read every school's question_text + model_answer (an IP/data leak in a
-- multi-school product). Introduce a `shared` flag:
--   * existing questions are backfilled shared=true (the shared central bank, so
--     nothing pupils currently see disappears — verified: 2362/2362 still visible);
--   * NEW questions default shared=false (private) and are visible only to the
--     author, their pupils, the author's HoD, and moderators.
-- topics/subjects are left readable (a shared curriculum taxonomy, not the IP).
--
-- FOLLOW-UP (not done here): restrict who may set shared=true (column grant) so
-- teachers can't self-publish to the central bank — central should be curated by
-- a moderator action. And a moderator "publish to shared" UI.
alter table public.questions add column if not exists shared boolean not null default false;
update public.questions set shared = true where shared is distinct from true;

create or replace function public.can_view_question(q_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from questions q
    where q.id = q_id and (
      q.shared
      or q.created_by = auth.uid()
      or public.is_moderator()
      or exists (select 1 from profiles tp where tp.id = q.created_by and tp.hod_id = auth.uid())
      or exists (select 1 from class_members cm join classes c on c.id = cm.class_id
                 where cm.student_id = auth.uid() and c.teacher_id = q.created_by)
    )
  );
$$;
revoke all on function public.can_view_question(uuid) from public;
grant execute on function public.can_view_question(uuid) to authenticated;

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
for select to authenticated using (public.can_view_question(id));
