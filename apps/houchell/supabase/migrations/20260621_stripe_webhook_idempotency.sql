-- =====================================================================
-- Feynman Education — Stripe webhook idempotency
-- Applied to prod: (pending)
--
-- Stripe delivers events at-least-once and retries on any non-2xx, so the
-- billing webhook (/api/billing/webhook) can receive the SAME event id more
-- than once. Without a dedupe guard a retry re-applies the subscription
-- upsert. This table records every event id we've accepted; the handler does a
-- service-role INSERT after signature verification and treats a primary-key
-- conflict as "already processed → skip" (race-safe: concurrent retries collide
-- on the PK, only one wins).
--
-- Written ONLY by the webhook via the service role; no client read/write path.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) touches this table.

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency ledger for the Stripe billing webhook. One row per accepted event id; a PK conflict on INSERT means the event was already processed and is skipped.';
