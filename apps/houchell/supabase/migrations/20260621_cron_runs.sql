-- =====================================================================
-- Houchell Education — cron run audit (Ops · observability)
-- Applied to prod: (pending)
--
-- One row per cron invocation (success OR failure) so we can SEE whether the
-- snapshot / parent-report / MIS jobs are actually running. Today they fail
-- silently; /api/health reads the most-recent row per job to surface staleness.
-- Service-role written (the crons bypass RLS); authenticated read so an admin
-- can inspect run history from the app.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id          bigserial PRIMARY KEY,
  job         text NOT NULL,
  started_at  timestamptz,
  finished_at timestamptz NOT NULL DEFAULT now(),
  ok          boolean,
  processed   int,
  failed      int,
  notes       text
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job
  ON public.cron_runs(job, finished_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_runs_authenticated_read ON public.cron_runs;
CREATE POLICY cron_runs_authenticated_read ON public.cron_runs
  FOR SELECT TO authenticated
  USING (true);
GRANT SELECT ON public.cron_runs TO authenticated;

COMMENT ON TABLE public.cron_runs IS
  'Audit row per cron invocation (success or failure). Service-role written; authenticated read. Powers /api/health staleness checks.';
