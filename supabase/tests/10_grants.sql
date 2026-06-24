-- =====================================================================
-- Test grants — emulate Supabase's default privilege grants.
--
-- In a real Supabase project the `anon` and `authenticated` roles receive
-- table/sequence/function privileges automatically (via ALTER DEFAULT
-- PRIVILEGES set up at project creation). Our migrations therefore assume
-- those grants exist and only manage RLS POLICIES. Re-create them here so
-- that ROW-LEVEL SECURITY — not a missing table grant — is what gates
-- access in the tests. RLS stays the real boundary: a granted-but-RLS-
-- enabled table still denies by default until a policy allows the row.
-- =====================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon;
GRANT USAGE, SELECT                  ON ALL SEQUENCES  IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE                        ON ALL FUNCTIONS  IN SCHEMA public TO anon, authenticated;

-- profiles/auth.users reads happen inside RLS policy subqueries and
-- SECURITY DEFINER bodies; authenticated needs to read its own profile row.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON auth.users      TO authenticated;
