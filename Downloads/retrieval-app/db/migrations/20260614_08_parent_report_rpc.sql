-- STATUS: NOT YET APPLIED — apply to project uvzukwoxqhcxaxtzrziy before the
-- in-app parent report route (/parent/[token]) will return data.
--
-- Brings parent progress reports IN-APP (previously an external parent-hub).
-- A parent opens a revocable link containing an unguessable token; this
-- SECURITY DEFINER function returns ONLY that one pupil's progress for that one
-- class, so no account or broad read access is needed. RLS is bypassed by the
-- definer, but the function is scoped strictly to the row matching the token.

create or replace function public.parent_report(p_token uuid)
returns json
language sql
security definer
set search_path = public
as $$
  with tok as (
    select student_id, class_id from parent_tokens where token = p_token
  ),
  resp as (
    select r.is_correct, r.answered_at
    from responses r, tok
    where r.student_id = tok.student_id and r.class_id = tok.class_id
  )
  select case when not exists (select 1 from tok) then null else json_build_object(
    'student_name',    (select display_name from profiles p, tok where p.id = tok.student_id),
    'class_name',      (select name from classes c, tok where c.id = tok.class_id),
    'total_answered',  (select count(*) from resp),
    'total_correct',   (select count(*) from resp where is_correct),
    'week_answered',   (select count(*) from resp where answered_at >= date_trunc('week', now())),
    'last_answered_at',(select max(answered_at) from resp),
    'recent',          (select coalesce(json_agg(x), '[]'::json)
                          from (select is_correct, answered_at from resp order by answered_at desc limit 30) x)
  ) end;
$$;

revoke all on function public.parent_report(uuid) from public;
grant execute on function public.parent_report(uuid) to anon, authenticated;
