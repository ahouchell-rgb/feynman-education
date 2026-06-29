-- =====================================================================
-- Houchell Education — Parent Portal (token magic-link)
-- Applied to prod: (pending)
--
-- Completes Build 1. Parents get a read-only portal (list children, latest
-- report, practise link) WITHOUT a password/account — they reach it via a
-- long random per-guardian token carried in the report emails:
--   /parent?t=<guardians.access_token>
-- and can stop emails per child via guardian_student.unsubscribe_token.
--
-- The portal + unsubscribe API routes validate these tokens server-side with
-- the service role and only ever expose a guardian's OWN consented children.
-- No new RLS surface is opened to anon clients.
-- =====================================================================

ALTER TABLE public.guardians
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Token lookup for the portal route (service-role read).
CREATE UNIQUE INDEX IF NOT EXISTS idx_guardians_access_token
  ON public.guardians(access_token);

COMMENT ON COLUMN public.guardians.access_token IS
  'Long random token for the password-less parent portal (/parent?t=). Resolved server-side with the service role; scopes to this guardian''s consented children only.';
