-- =====================================================================
-- Houchell Education — MIS attainment write-back queue (Build 3, phase 2)
-- Applied to prod: (pending)
--
-- The stickiest half of the moat: push attainment (predicted grades / marks)
-- FROM us back INTO the school MIS via Wonde. Modelled as a durable queue so
-- writes are retryable, auditable, and decoupled from the source: anything that
-- can produce per-pupil values (a predicted-grades CSV, an assessment, derived
-- mastery) enqueues rows; a worker pushes them and records the outcome.
--
-- Wonde write-back is approval- and provider-gated (not every MIS supports it),
-- so the engine is best-effort and records per-row errors rather than failing.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.mis_writeback_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_mis_id text NOT NULL,
  aspect         text NOT NULL,                 -- the MIS marksheet column/aspect
  value          text NOT NULL,                 -- e.g. "6", "Grade 6", "85"
  source         text NOT NULL DEFAULT 'csv'    -- csv | predicted_grade | assessment | mastery
                   CHECK (source IN ('csv','predicted_grade','assessment','mastery')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','error','skipped')),
  attempts       int NOT NULL DEFAULT 0,
  last_error     text,
  external_ref   text,                          -- Wonde id of the written record
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mis_writeback_school_status
  ON public.mis_writeback_queue(school_id, status);

ALTER TABLE public.mis_writeback_queue ENABLE ROW LEVEL SECURITY;
-- School members can see the queue/audit; all writes are service-role (the
-- enqueue route gates on slt then inserts as service role; the worker updates).
DROP POLICY IF EXISTS mis_writeback_member_read ON public.mis_writeback_queue;
CREATE POLICY mis_writeback_member_read ON public.mis_writeback_queue
  FOR SELECT TO authenticated
  USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT ON public.mis_writeback_queue TO authenticated;

COMMENT ON TABLE public.mis_writeback_queue IS
  'Durable, retryable queue of attainment values to push back to the MIS via Wonde. Service-role written; school-member read.';
