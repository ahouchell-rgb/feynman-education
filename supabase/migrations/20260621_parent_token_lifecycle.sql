-- =====================================================================
-- Feynman Education — Parent magic-link token lifecycle
-- Applied to prod: (pending)
--
-- Hardens the password-less parent portal link (/parent?t=<guardians.access_token>).
-- Previously the token was a plaintext UUID with NO expiry and NO rotation, so a
-- leaked report-email link granted PERMANENT access to a child's reports.
--
-- This adds an expiry column with a 60-day default for NEW guardians, and
-- backfills existing rows to 60 days from now so currently-valid email links are
-- NOT broken on deploy. The portal route enforces the expiry and, on successful
-- access, slides the window forward (extends the expiry) so an actively-used link
-- keeps working while an unused/leaked one lapses.
--
-- Rotation note: full per-email token ROTATION (issue a brand-new token each
-- weekly send and surface it in that email) is intentionally NOT done here — it
-- would invalidate every previously-sent email's link and needs the email body to
-- carry the new link. Tracked as a follow-up; sliding expiry is the pragmatic
-- first step that closes the "permanent access" hole without breaking the flow.
-- =====================================================================

ALTER TABLE public.guardians
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz
    NOT NULL DEFAULT (now() + interval '60 days');

-- Backfill existing tokens to a fresh 60-day window so live email links keep
-- working through the transition (the DEFAULT only applies to new inserts).
UPDATE public.guardians
  SET access_token_expires_at = now() + interval '60 days'
  WHERE access_token_expires_at IS NULL
     OR access_token_expires_at < now() + interval '60 days';

COMMENT ON COLUMN public.guardians.access_token_expires_at IS
  'Expiry for the parent-portal magic-link token. Default 60 days; the portal route extends it (sliding window) on each successful access. Expired tokens are rejected. Full per-email rotation is a tracked follow-up.';
