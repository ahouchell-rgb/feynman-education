-- STATUS: NOT YET APPLIED — apply to project uvzukwoxqhcxaxtzrziy before the
-- "Export data" (DSAR) button in the Admin panel will work.
--
-- GDPR data-portability / subject-access support: returns ALL of one pupil's
-- personal data as JSON, for the school to fulfil a data-subject request.
-- SECURITY DEFINER (bypasses RLS) but gated to a moderator OR a teacher who owns
-- a class the pupil belongs to; any other caller gets NULL.
--
-- NOTE: if a referenced table/column name differs in your schema, adjust here
-- (uses `select *` to be tolerant of column differences).

create or replace function public.export_student_data(p_student uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'exported_at',       now(),
    'profile',           (select to_json(p) from (select * from profiles where id = p_student) p),
    'class_memberships', (select coalesce(json_agg(cm), '[]'::json) from (select * from class_members where student_id = p_student) cm),
    'responses',         (select coalesce(json_agg(r), '[]'::json) from (select * from responses where student_id = p_student) r),
    'paper_attempts',    (select coalesce(json_agg(a), '[]'::json) from (select * from paper_attempts where student_id = p_student) a),
    'paper_responses',   (select coalesce(json_agg(pr), '[]'::json)
                            from (select pr.* from paper_responses pr
                                  join paper_attempts a on a.id = pr.attempt_id
                                  where a.student_id = p_student) pr)
  )
  where public.is_moderator()
     or exists (
       select 1 from class_members cm
       join classes c on c.id = cm.class_id
       where cm.student_id = p_student and c.teacher_id = auth.uid()
     );
$$;

revoke all on function public.export_student_data(uuid) from public;
grant execute on function public.export_student_data(uuid) to authenticated;
