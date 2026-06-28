-- =====================================================================
-- Feynman Education — School benchmark snapshots (NOW plan · E1 / T1.3)
-- Applied to prod: (pending)
--
-- Mirrors trust_benchmark_snapshots one level down: a weekly per-school
-- snapshot powers a school-average trend and instant dashboard load.
-- Cron-written (service role); school-member RLS read.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.school_benchmark_snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  taken_on   date NOT NULL DEFAULT CURRENT_DATE,
  school_avg int,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { objectives:[{topic_name,avg,classes}] }
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, taken_on)
);

CREATE INDEX IF NOT EXISTS idx_school_snapshots_school
  ON public.school_benchmark_snapshots(school_id, taken_on DESC);

ALTER TABLE public.school_benchmark_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_snapshots_member_read ON public.school_benchmark_snapshots;
CREATE POLICY school_snapshots_member_read ON public.school_benchmark_snapshots
  FOR SELECT TO authenticated
  USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT ON public.school_benchmark_snapshots TO authenticated;

COMMENT ON TABLE public.school_benchmark_snapshots IS
  'Weekly per-school benchmark snapshots (cron-written, member read). Powers school-average trend + instant load.';
