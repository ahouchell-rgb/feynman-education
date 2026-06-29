-- =====================================================================
-- ScienceKit — Build 6: holiday_periods (whole-week school closures)
-- Bug fix: half-term and other multi-day closures didn't pause the
-- Week A / Week B cycle counter. Adding 5 inset days would hide the
-- days from the homepage but the cycle counter rolled straight through
-- the holiday, so the Monday after half-term landed on the WRONG week
-- of the cycle.
--
-- Fix: add `holiday_periods` (jsonb array of {start,end[,label]}) on
-- timetable_calendar, and teach get_teaching_week to (a) skip dates
-- inside any holiday period, and (b) subtract any FULL Mon–Fri school
-- week consumed by a holiday period from the cycle count.
--
-- inset_days keeps its existing semantics: single-day closures that
-- DON'T pause the cycle (e.g. one-off training days, snow days).
-- =====================================================================

ALTER TABLE public.timetable_calendar
  ADD COLUMN IF NOT EXISTS holiday_periods jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.timetable_calendar.holiday_periods IS
  'Array of {start, end[, label]} closures lasting one or more whole school weeks. '
  'Each FULL Mon-Fri week contained in a holiday_period pauses the Week A/B cycle. '
  'For single-day closures that should NOT pause the cycle, use inset_days instead.';

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
  v_lost_weeks int;
  v_week_in_cycle int;
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

  -- Count full Mon–Fri school weeks consumed by holiday periods that
  -- ENDED strictly before the current week. Each such week pauses the
  -- A/B cycle by one position.
  SELECT COALESCE(COUNT(*), 0)::int INTO v_lost_weeks
  FROM generate_series(
    v_calendar.cycle_anchor_date,
    v_week_start - INTERVAL '7 days',
    INTERVAL '7 days'
  ) AS mon
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_calendar.holiday_periods, '[]'::jsonb)) hp
    WHERE mon::date          >= (hp->>'start')::date
      AND (mon::date + 4)    <= (hp->>'end')::date
  );

  -- The cycle position for THIS calendar week, with holidays subtracted.
  v_week_in_cycle :=
    ((((v_week_start - v_calendar.cycle_anchor_date) / 7) - v_lost_weeks) % 2 + 2) % 2 + 1;

  WITH days AS (
    SELECT
      d::date AS date,
      EXTRACT(ISODOW FROM d)::int AS dow,
      v_week_in_cycle AS week_in_cycle
    FROM generate_series(v_week_start, v_week_start + 4, '1 day') d
    WHERE d::date <> ALL(v_calendar.inset_days)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_calendar.holiday_periods, '[]'::jsonb)) hp
        WHERE d::date BETWEEN (hp->>'start')::date AND (hp->>'end')::date
      )
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

GRANT EXECUTE ON FUNCTION public.get_teaching_week(date) TO authenticated;
