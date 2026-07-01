-- =====================================================================
-- Houchell Education — Home-course premium interest capture (D2C · E8)
-- Applied to prod: (pending)
--
-- The parent portal's premium card told parents "you're on the list" but
-- recorded that only in local component state — nothing was persisted, so
-- nobody could ever be contacted at launch. This makes the register-interest
-- CTA real:
--   • home_course_interest — one row per guardian (PK = guardian_id, so a
--     repeat registration is a no-op).
--   • Writes are service-role only, through the token-validated API route
--     (/api/parent/home-course/interest) — parents have no account/JWT.
--   • The teacher who owns the guardian can read the row (same ownership
--     model as public.guardians), so the list is actionable at launch.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.home_course_interest (
  guardian_id uuid PRIMARY KEY REFERENCES public.guardians(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_course_interest ENABLE ROW LEVEL SECURITY;

-- Read-only for the owning teacher; no INSERT/UPDATE/DELETE grant for
-- authenticated — mutations go through the service-role route only.
DROP POLICY IF EXISTS home_course_interest_owner_read ON public.home_course_interest;
CREATE POLICY home_course_interest_owner_read ON public.home_course_interest
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.guardians g
    WHERE g.id = guardian_id AND g.teacher_id = auth.uid()
  ));
GRANT SELECT ON public.home_course_interest TO authenticated;

COMMENT ON TABLE public.home_course_interest IS
  'Guardians who registered interest in the paid Home-course tier from the parent portal (token-validated route; service-role writes; owner-teacher reads).';
