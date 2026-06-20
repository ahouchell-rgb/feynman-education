-- =====================================================================
-- Feynman Education — MAT / Trust rollup + benchmarking (strategy Build 4)
-- Applied to prod: (pending)
--
-- Trusts buy centrally and want cross-school consistency + benchmarking.
-- This adds a trust above schools (Build 2) and a trust_lead role that can
-- see every school in the trust compared side by side — built on the SAME
-- single mastery graph, so no new data, just a higher aggregation level.
--
-- As with Build 2, the cross-org read is ONE security-definer RPC
-- (trust_classes), gated to trust_lead callers and scoped to their trust.
-- Base-table RLS stays owner-scoped; only non-personal class aggregates roll up.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.trusts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trusts_set_updated_at ON public.trusts;
CREATE TRIGGER trusts_set_updated_at
  BEFORE UPDATE ON public.trusts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.trusts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trusts_member_read ON public.trusts;
CREATE POLICY trusts_member_read ON public.trusts
  FOR SELECT TO authenticated
  USING (id = (SELECT trust_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT ON public.trusts TO authenticated;

-- schools belong to a trust (nullable: a standalone school has none).
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS trust_id uuid REFERENCES public.trusts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_schools_trust ON public.schools(trust_id);

-- A trust member can read every school in their trust (for the picker/benchmark).
DROP POLICY IF EXISTS schools_trust_read ON public.schools;
CREATE POLICY schools_trust_read ON public.schools
  FOR SELECT TO authenticated
  USING (trust_id IS NOT NULL AND trust_id = (SELECT trust_id FROM public.profiles WHERE id = auth.uid()));

-- profiles: trust membership + trust-level role.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_id uuid REFERENCES public.trusts(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_role text NOT NULL DEFAULT 'member'
    CHECK (trust_role IN ('member','trust_lead'));
CREATE INDEX IF NOT EXISTS idx_profiles_trust ON public.profiles(trust_id);

COMMENT ON COLUMN public.profiles.trust_role IS
  'trust_lead can see every school in the trust via trust_classes(); member cannot. Assigned out-of-band.';

-- ---------------------------------------------------------------------
-- trust_classes(): the only cross-school read. SECURITY DEFINER, returns
-- rows ONLY to a trust_lead, scoped to schools in the caller's trust.
-- Non-personal: class metadata + retrieval ids the dashboard aggregates.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trust_classes()
RETURNS TABLE (
  school_id uuid, school_name text, class_id uuid, name text,
  year_group int, discipline text, teacher_name text, retrieval_class_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trust uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT p.trust_id, p.trust_role INTO v_trust, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_trust IS NULL OR v_role <> 'trust_lead' THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id, s.name, c.id, c.name, c.year_group, c.discipline::text,
         tp.full_name, c.retrieval_class_ids
  FROM public.classes c
  JOIN public.profiles tp ON tp.id = c.teacher_id
  JOIN public.schools s ON s.id = tp.school_id
  WHERE s.trust_id = v_trust
    AND c.archived = false
  ORDER BY s.name, c.year_group, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trust_classes() TO authenticated;

COMMENT ON FUNCTION public.trust_classes() IS
  'Trust-wide class list for the MAT dashboard. Returns rows only to trust_lead callers, scoped to their trust. Non-personal.';
