-- =====================================================================
-- Houchell Education — Audit log (NOW plan · E4 / T4.1)
-- Applied to prod: (pending)
--
-- A tamper-evident record of privileged actions (exports, MIS sync/write-back,
-- role changes …). Service-role written; a user can read their own actions.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action   text NOT NULL,                 -- e.g. data.export | mis.sync | mis.writeback | role.change
  target   text,                          -- the thing acted on (school_id, target user, …)
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id, at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- A user can see their own audit trail; writes are service-role only.
DROP POLICY IF EXISTS audit_actor_read ON public.audit_log;
CREATE POLICY audit_actor_read ON public.audit_log
  FOR SELECT TO authenticated USING (actor_id = auth.uid());
GRANT SELECT ON public.audit_log TO authenticated;

COMMENT ON TABLE public.audit_log IS
  'Privileged-action audit trail. Service-role written; actor-readable. RPC-level auditing of role changes is a follow-up.';
