-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-22 (via Supabase apply_migration).
--
-- SECURITY FIX. anon_mark_usage (20260621_05) shipped with RLS DISABLED and the
-- default public-schema grants intact, so the anon role could SELECT/INSERT/UPDATE/
-- DELETE/TRUNCATE the cost counter directly through PostgREST. Because mark-preview's
-- rate limiter FAILS OPEN, an attacker who deletes/truncates the counter rows resets
-- the daily cap to zero and can trigger unlimited paid Haiku marking via the public
-- booklet embed. (Supabase advisor: rls_disabled_in_public, ERROR.)
--
-- This brings anon_mark_usage in line with anon_funnel_events (20260621_07): RLS on,
-- no policies, API roles revoked. The legitimate write path is unaffected —
-- anon_mark_bump is SECURITY DEFINER (runs as owner, bypasses RLS) and is only called
-- by the service-role mark-preview function (service_role also bypasses RLS).

alter table public.anon_mark_usage enable row level security;
revoke all on public.anon_mark_usage from anon, authenticated;

comment on table public.anon_mark_usage is
  'Per-bucket/day counter for anonymous mark-preview calls (cost guard for the public booklet embed). RLS on + API roles revoked; written only via the SECURITY DEFINER anon_mark_bump RPC. See 20260621_05 (created) and 20260622_01 (RLS lockdown).';
