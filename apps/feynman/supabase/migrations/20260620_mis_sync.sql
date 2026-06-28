-- =====================================================================
-- Feynman Education — MIS sync (Wonde) — strategy Build 3
-- Applied to prod: (pending)
--
-- The "system of record" hook. Pulls roster + parent-contact data from the
-- school MIS (SIMS/Arbor/Bromcom) via Wonde's single API into STAGING tables,
-- then lets staff reconcile it into live data — initially by importing parent
-- contacts as guardian links for the weekly parent report (Build 1), removing
-- the manual data entry on the Parents screen.
--
-- Staging-first on purpose: the sync NEVER mutates owner-scoped live tables
-- directly. It mirrors the MIS into school-scoped staging; reconciliation into
-- guardians/classes is an explicit, owner-authorised step.
--
-- The Wonde access token lives in env (WONDE_TOKEN), not the DB. A connection
-- row only records WHICH school + status, never the secret.
-- =====================================================================

-- ---------------------------------------------------------------------
-- mis_connections: one MIS link per school.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mis_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'wonde',
  mis_school_id     text NOT NULL,                  -- Wonde school id
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','error','disabled')),
  last_full_sync_at timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS mis_connections_set_updated_at ON public.mis_connections;
CREATE TRIGGER mis_connections_set_updated_at
  BEFORE UPDATE ON public.mis_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Staging mirror of MIS people. school-scoped, written by the sync
-- (service role), readable by school members for reconciliation.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mis_students (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  mis_id     text NOT NULL,
  full_name  text,
  year_group int,
  form       text,
  upn        text,
  raw        jsonb,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, mis_id)
);
CREATE INDEX IF NOT EXISTS idx_mis_students_school_year ON public.mis_students(school_id, year_group);

CREATE TABLE IF NOT EXISTS public.mis_contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  mis_id         text NOT NULL,
  student_mis_id text,
  full_name      text,
  email          text,
  relationship   text,
  priority       int,                                -- 1 = primary contact
  raw            jsonb,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, mis_id, student_mis_id)
);
CREATE INDEX IF NOT EXISTS idx_mis_contacts_student ON public.mis_contacts(school_id, student_mis_id);

CREATE TABLE IF NOT EXISTS public.mis_sync_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'full',          -- full | manual
  status      text NOT NULL DEFAULT 'ok',            -- ok | error
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mis_sync_runs_school ON public.mis_sync_runs(school_id, started_at DESC);

-- ── RLS: school members read; all writes are service-role (the sync). ──
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mis_connections','mis_students','mis_contacts','mis_sync_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_read ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member_read ON public.%I FOR SELECT TO authenticated '
      'USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()))', t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.mis_connections IS 'Per-school MIS (Wonde) link. Token is in env, never stored here.';
COMMENT ON TABLE public.mis_students IS 'Staging mirror of MIS pupils. Reconciled into live data explicitly, never auto-written.';
COMMENT ON TABLE public.mis_contacts IS 'Staging mirror of MIS parent/carer contacts — source for guardian-link import (Build 1).';
