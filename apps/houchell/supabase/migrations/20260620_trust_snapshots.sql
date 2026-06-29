-- =====================================================================
-- Houchell Education — Trust benchmark snapshots (Build 4 follow-up)
-- Applied to prod: (pending)
--
-- The MAT rollup fans out across every class on each page load. This stores a
-- periodic snapshot per trust so the dashboard can show "as of <date>" instantly
-- AND plot a trust-average trend over time — which is the language MATs buy on.
-- Written by the snapshot cron (service role); read by trust members (RLS).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.trust_benchmark_snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id   uuid NOT NULL REFERENCES public.trusts(id) ON DELETE CASCADE,
  taken_on   date NOT NULL DEFAULT CURRENT_DATE,
  trust_avg  int,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { schools:[...], cohort:[...] }
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trust_id, taken_on)
);

CREATE INDEX IF NOT EXISTS idx_trust_snapshots_trust
  ON public.trust_benchmark_snapshots(trust_id, taken_on DESC);

ALTER TABLE public.trust_benchmark_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trust_snapshots_member_read ON public.trust_benchmark_snapshots;
CREATE POLICY trust_snapshots_member_read ON public.trust_benchmark_snapshots
  FOR SELECT TO authenticated
  USING (trust_id = (SELECT trust_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT ON public.trust_benchmark_snapshots TO authenticated;

COMMENT ON TABLE public.trust_benchmark_snapshots IS
  'Periodic per-trust benchmark snapshots (cron-written, trust-member read). Powers instant load + trust-average trend.';
