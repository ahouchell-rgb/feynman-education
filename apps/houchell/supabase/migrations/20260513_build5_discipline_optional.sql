-- =====================================================================
-- Build 5 (small): make classes.discipline optional
-- Applied to prod: 2026-05-13
--
-- Reason: forcing every class to pick one of biology/chemistry/physics
-- doesn't match how teachers actually work. KS3 is "science." Combined
-- Science classes are taught across all three. Separate Science classes
-- are often delivered by one teacher across all three disciplines.
--
-- The discipline tag remains on units (where it accurately describes
-- content). It is no longer a gate on which units a class can teach.
-- =====================================================================

ALTER TABLE public.classes
  ALTER COLUMN discipline DROP NOT NULL;

COMMENT ON COLUMN public.classes.discipline IS
  'Optional. NULL means any science (KS3, combined, or teacher teaches all three). When set, used as a hint for filtering and accent colour; does NOT restrict which units the class can teach.';

-- Update homepage function to take discipline from current unit, falling back to class.
CREATE OR REPLACE FUNCTION public.get_teaching_week(
  p_anchor_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_calendar timetable_calendar%ROWTYPE;
  v_week_start date;
  v_result jsonb;
BEGIN
  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  v_week_start := p_anchor_date
    - ((EXTRACT(ISODOW FROM p_anchor_date)::int - 1) || ' days')::interval;

  SELECT * INTO v_calendar
  FROM timetable_calendar
  WHERE teacher_id = v_teacher_id
    AND cycle_anchor_date <= p_anchor_date
  ORDER BY cycle_anchor_date DESC
  LIMIT 1;

  IF v_calendar.teacher_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'no_calendar_configured',
      'message', 'Set your academic year cycle anchor in /setup'
    );
  END IF;

  WITH days AS (
    SELECT
      d::date AS date,
      EXTRACT(ISODOW FROM d)::int AS dow,
      (((d::date - v_calendar.cycle_anchor_date) / 7) % 2) + 1 AS week_in_cycle
    FROM generate_series(v_week_start, v_week_start + 4, '1 day') d
    WHERE d::date <> ALL(v_calendar.inset_days)
  ),
  scheduled AS (
    SELECT
      d.date,
      d.dow,
      s.period,
      COALESCE(s.period_label, 'P' || s.period) AS period_label,
      s.room,
      c.id AS class_id,
      c.name AS class_name,
      c.year_group,
      COALESCE(u.discipline::text, c.discipline::text, 'combined') AS discipline,
      c.retrieval_class_ids,
      cp.current_unit_id,
      u.title AS unit_title,
      cp.current_lesson_id,
      l.title AS lesson_title,
      l.lesson_number,
      cp.last_taught_lesson_id,
      cp.last_taught_at,
      EXISTS (
        SELECT 1 FROM taught_log tl
        WHERE tl.teacher_id = v_teacher_id
          AND tl.lesson_id = cp.current_lesson_id
          AND tl.retrieval_class_ids && c.retrieval_class_ids
      ) AS already_taught
    FROM days d
    JOIN class_timetable_slots s
      ON s.day_of_week = d.dow AND s.week_in_cycle = d.week_in_cycle
    JOIN classes c
      ON c.id = s.class_id
     AND c.teacher_id = v_teacher_id
     AND c.archived = false
     AND c.academic_year = v_calendar.academic_year
    LEFT JOIN class_progress cp ON cp.class_id = c.id
    LEFT JOIN units u ON u.id = cp.current_unit_id
    LEFT JOIN lessons l ON l.id = cp.current_lesson_id
  )
  SELECT jsonb_build_object(
    'week_start', v_week_start,
    'academic_year', v_calendar.academic_year,
    'lessons', COALESCE(
      (SELECT jsonb_agg(to_jsonb(scheduled) ORDER BY date, period) FROM scheduled),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
