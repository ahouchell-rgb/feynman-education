-- =====================================================================
-- Feynman Education — test base fixture (NOT a production migration).
--
-- The migration history in supabase/migrations/ is additive on top of an
-- earlier hand-bootstrapped base (auth + a few core tables/enums) that pre-
-- dates the migration log and is therefore NOT in the repo. To replay the
-- migrations against a throwaway Postgres for RLS / SECURITY-DEFINER tests,
-- we recreate just enough of that base here:
--   • the Supabase `auth` surface the policies depend on (auth.uid, auth.users)
--   • the three Supabase roles (anon / authenticated / service_role)
--   • the pre-existing enums (discipline, key_stage)
--   • the pre-existing tables the migrations ALTER or reference
--     (profiles, units, lessons, taught_log, decks)
--
-- This is a TEST APPROXIMATION of prod, sufficient to apply the migrations
-- and exercise the security surface. It is not authoritative schema.
-- =====================================================================

-- ── Supabase roles ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- ── auth surface ─────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- auth.uid() reads the JWT subject the way Supabase's GoTrue does. Tests set
-- request.jwt.claim.sub to simulate "who is calling".
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ── pre-existing enums ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discipline') THEN
    CREATE TYPE public.discipline AS ENUM ('biology','chemistry','physics','combined');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'key_stage') THEN
    CREATE TYPE public.key_stage AS ENUM ('ks3','ks4','ks5');
  END IF;
END $$;

-- ── pre-existing tables (stubs: only the columns the migrations need) ─
-- profiles. The org/role columns (school_id/school_role/trust_id/trust_role)
-- pre-existed in prod when the schools_roles migration ran: that migration
-- creates a policy referencing profiles.school_id BEFORE its own
-- `ALTER ... ADD COLUMN IF NOT EXISTS school_id` (which then no-ops). Declaring
-- them here reproduces that prod state so the migrations replay cleanly. (FKs to
-- schools/trusts are omitted — those tables don't exist yet at base time; the
-- migration's ADD COLUMN IF NOT EXISTS simply finds the column already present.)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  school_id   uuid,
  school_role text NOT NULL DEFAULT 'member',
  trust_id    uuid,
  trust_role  text NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- groups: a year-group/curriculum grouping (pre-existing catalog table; seeded
-- by the demo-Maths migration and read by the objective backfill).
CREATE TABLE IF NOT EXISTS public.groups (
  id         text PRIMARY KEY,
  label      text,
  key_stage  public.key_stage,
  sort_order int
);

CREATE TABLE IF NOT EXISTS public.units (
  id             text PRIMARY KEY,
  group_id       text,              -- FK to groups in prod; plain here (order-free)
  title          text,
  discipline     public.discipline,
  year_group     int,
  term           text,
  sort_order     int,
  hours          int,
  big_idea       text,
  content        text,
  misconceptions text[],
  keywords       text[],
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       text REFERENCES public.units(id) ON DELETE CASCADE,
  title         text,
  lesson_number int,
  sort_order    int,
  objectives    text,
  keywords      text[],
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- taught_log: read by get_teaching_week() and friends (teacher_id, lesson_id,
-- retrieval_class_ids[]).
CREATE TABLE IF NOT EXISTS public.taught_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id           uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  retrieval_class_ids uuid[] NOT NULL DEFAULT '{}',
  taught_at           timestamptz NOT NULL DEFAULT now()
);

-- decks: ALTERed by later migrations (drive ids, is_public, share_token).
CREATE TABLE IF NOT EXISTS public.decks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text,
  slides     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- These pre-existing tables carry RLS in prod (it lives outside the migration
-- log). Enable it here too so the "every public table has RLS" guardrail
-- (20_security.test.sql TEST 9) only ever flags a table the MIGRATIONS forgot,
-- never one of these test stubs.
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taught_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks      ENABLE ROW LEVEL SECURITY;

-- Minimal, realistic policies (not under test, but keep the stubs usable):
DROP POLICY IF EXISTS profiles_self ON public.profiles;
CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS groups_read ON public.groups;
CREATE POLICY groups_read ON public.groups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS units_read ON public.units;
CREATE POLICY units_read ON public.units FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS lessons_read ON public.lessons;
CREATE POLICY lessons_read ON public.lessons FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS taught_log_owner ON public.taught_log;
CREATE POLICY taught_log_owner ON public.taught_log FOR ALL TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
DROP POLICY IF EXISTS decks_owner ON public.decks;
CREATE POLICY decks_owner ON public.decks FOR ALL TO authenticated USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
