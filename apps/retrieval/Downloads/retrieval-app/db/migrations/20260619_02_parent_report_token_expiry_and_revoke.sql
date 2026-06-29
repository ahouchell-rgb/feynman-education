-- STATUS: APPLIED (2026-06-19) to project uvzukwoxqhcxaxtzrziy.
--
-- P1 child-data safety: parent_report tokens were valid FOREVER. parent_report() is
-- granted to anon and returns a NAMED pupil's full progress for any row in
-- parent_tokens. The UUIDv4 token is unguessable, but a leaked link (forwarded email,
-- browser history, Referer header on an outbound click) stayed live indefinitely —
-- unacceptable for a child-data product under UK data-protection scrutiny.
--
-- Adds a bounded lifetime (expires_at, default 365 days — a school year; tune freely)
-- and an explicit revoke (revoked_at), and enforces BOTH inside parent_report so an
-- expired or revoked link returns null. The parent route already renders a clean
-- "report not found" state for null, so no client change is required. Existing tokens
-- get ~365 days from this migration (the ADD COLUMN default backfills them), so live
-- parent links keep working.
--
-- Residual (not addressed here): the anon parent_report RPC has no per-IP RATE LIMIT
-- (would need edge/gateway-level infra; UUIDv4 + expiry already bound enumeration).
-- A teacher-facing "revoke link" button can later set revoked_at via a gated RPC.

alter table public.parent_tokens
  add column if not exists expires_at timestamptz not null default (now() + interval '365 days'),
  add column if not exists revoked_at timestamptz;

create or replace function public.parent_report(p_token uuid)
returns json
language sql
security definer
set search_path to 'public'
as $function$
  with tok as (
    select student_id, class_id
    from parent_tokens
    where token = p_token
      and revoked_at is null
      and now() < expires_at
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
$function$;
