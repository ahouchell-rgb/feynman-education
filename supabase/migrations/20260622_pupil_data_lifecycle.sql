-- =====================================================================
-- Feynman Education — Pupil data lifecycle (leaver deletion) · NOW plan E3
-- Applied to prod: (pending)
--
-- Makes the Trust Centre's "a pupil leaving triggers deletion" claim real for
-- the data where the SCHOOL is the controller: the MIS roster (mis_students +
-- their class membership + their MIS contacts). A pupil who has dropped off the
-- roster — i.e. was NOT refreshed by the school's most recent successful MIS
-- sync — and who has been gone longer than the retention window is purged, and
-- a (non-identifying) deletion record is written for audit.
--
-- SAFETY: we only purge for a school whose latest successful sync is RECENT
-- (p_max_sync_age_days). A broken or stalled sync must never be read as "every
-- pupil left" — so if the freshest ok sync is stale, that school is skipped.
--
-- Parent-side D2C data (guardian_student / parent_reports) is keyed to the
-- parent relationship + retrieval pupil ids, not the MIS roster, and follows
-- the consent / unsubscribe lifecycle; it is intentionally out of scope here.
-- =====================================================================

-- A defensible record that a pupil's roster data was deleted, WITHOUT retaining
-- the personal data itself (we keep the opaque MIS id + counts, not the name).
CREATE TABLE IF NOT EXISTS public.pupil_purge_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  mis_id      text NOT NULL,
  reason      text NOT NULL DEFAULT 'left_roster',
  rows_purged jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {students, class_links, contacts}
  purged_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pupil_purge_log_school ON public.pupil_purge_log(school_id, purged_at DESC);

-- RLS: an SLT can read their own school's deletion record (transparency for the
-- controller); nobody can write from the client — only the SECURITY DEFINER
-- purge below (service-role/cron) inserts.
ALTER TABLE public.pupil_purge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pupil_purge_log_slt_read ON public.pupil_purge_log;
CREATE POLICY pupil_purge_log_slt_read ON public.pupil_purge_log
  FOR SELECT TO authenticated
  USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
         AND (SELECT school_role FROM public.profiles WHERE id = auth.uid()) IN ('hod','slt'));
GRANT SELECT ON public.pupil_purge_log TO authenticated;

-- ── purge_left_pupils(): the lifecycle job (called by the cron, service role) ──
CREATE OR REPLACE FUNCTION public.purge_left_pupils(
  p_retention_days    int DEFAULT 365,   -- keep a leaver's data this long after they drop off
  p_max_sync_age_days int DEFAULT 8      -- only act if a successful sync happened this recently
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purged   int := 0;
  v_last     timestamptz;
  s          record;
  p          record;
  v_links    int;
  v_contacts int;
BEGIN
  FOR s IN SELECT id AS school_id FROM public.schools LOOP
    -- Freshest successful sync for this school.
    SELECT max(finished_at) INTO v_last
    FROM public.mis_sync_runs
    WHERE school_id = s.school_id AND status = 'ok' AND finished_at IS NOT NULL;

    -- No recent successful sync → don't infer leavers from stale data.
    IF v_last IS NULL OR v_last < now() - make_interval(days => p_max_sync_age_days) THEN
      CONTINUE;
    END IF;

    -- Leavers: present in our roster but NOT refreshed by the latest sync, and
    -- past the retention window.
    FOR p IN
      SELECT mis_id FROM public.mis_students
      WHERE school_id = s.school_id
        AND synced_at < v_last
        AND synced_at < now() - make_interval(days => p_retention_days)
    LOOP
      DELETE FROM public.mis_class_students
        WHERE school_id = s.school_id AND student_mis_id = p.mis_id;
      GET DIAGNOSTICS v_links = ROW_COUNT;

      DELETE FROM public.mis_contacts
        WHERE school_id = s.school_id AND student_mis_id = p.mis_id;
      GET DIAGNOSTICS v_contacts = ROW_COUNT;

      DELETE FROM public.mis_students
        WHERE school_id = s.school_id AND mis_id = p.mis_id;

      INSERT INTO public.pupil_purge_log (school_id, mis_id, reason, rows_purged)
      VALUES (s.school_id, p.mis_id, 'left_roster',
              jsonb_build_object('students', 1, 'class_links', v_links, 'contacts', v_contacts));

      v_purged := v_purged + 1;
    END LOOP;
  END LOOP;

  RETURN v_purged;
END;
$$;

-- Service-role / cron only: NOT granted to `authenticated`. Deletion of pupil
-- data is never a client-callable action.
REVOKE ALL ON FUNCTION public.purge_left_pupils(int, int) FROM public, authenticated, anon;

COMMENT ON FUNCTION public.purge_left_pupils(int, int) IS
  'Leaver lifecycle: deletes MIS-roster data for pupils dropped from the latest '
  'successful sync and past retention. Skips schools without a recent ok sync. '
  'Called by the pupil-lifecycle cron via the service role.';
