-- =====================================================================
-- ScienceKit — Week 1: Classes, timetable, progress, calendar
-- Applied to prod: 2026-05-12
-- Migration: 20260512_week1_timetable_and_classes
--
-- Purpose: data foundation for the "This week" homepage. Models a
-- teacher's classes, their recurring timetable slots on a 2-week cycle,
-- their progress through the SoW, and the academic year configuration.
--
-- Depends on existing tables: profiles, units, lessons, taught_log.
-- Depends on existing enums: discipline, key_stage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- classes: a teacher's class group (e.g. "10A/Bi1", "8X/Sc2")
-- ---------------------------------------------------------------------
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  year_group int NOT NULL CHECK (year_group BETWEEN 7 AND 13),
  discipline public.discipline NOT NULL,
  key_stage public.key_stage NOT NULL,
  tier text NOT NULL DEFAULT 'none'
    CHECK (tier IN ('foundation','higher','none')),
  pathway text
    CHECK (pathway IN ('separate','combined','triple') OR pathway IS NULL),
  academic_year text NOT NULL,                  -- e.g. '2026-27'
  retrieval_class_ids uuid[] NOT NULL DEFAULT '{}',  -- link to retrieval-app classes
  current_unit_id text REFERENCES public.units(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_teacher_active
  ON public.classes(teacher_id) WHERE archived = false;
CREATE INDEX idx_classes_academic_year
  ON public.classes(teacher_id, academic_year);

-- ---------------------------------------------------------------------
-- class_timetable_slots: recurring slots in a 2-week cycle
-- ---------------------------------------------------------------------
CREATE TABLE public.class_timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  week_in_cycle int NOT NULL CHECK (week_in_cycle IN (1,2)),
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),  -- 1=Mon, 5=Fri
  period int NOT NULL CHECK (period BETWEEN 1 AND 5),            -- 5-period day
  period_label text,                                              -- null → UI uses 'P{period}'
  start_time time,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, week_in_cycle, day_of_week, period)
);

CREATE INDEX idx_slots_class ON public.class_timetable_slots(class_id);
CREATE INDEX idx_slots_lookup
  ON public.class_timetable_slots(week_in_cycle, day_of_week, period);

-- ---------------------------------------------------------------------
-- class_progress: where each class is in the SoW.
-- Unit-level always set; lesson-level optional (for when lessons exist).
-- ---------------------------------------------------------------------
CREATE TABLE public.class_progress (
  class_id uuid PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  current_unit_id text REFERENCES public.units(id) ON DELETE SET NULL,
  current_lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  last_taught_lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  last_taught_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- timetable_calendar: per-teacher per-year config.
-- cycle_anchor_date is a Monday that counts as Week 1 of the cycle.
-- ---------------------------------------------------------------------
CREATE TABLE public.timetable_calendar (
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  cycle_anchor_date date NOT NULL,
  term_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  inset_days date[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, academic_year)
);

-- ---------------------------------------------------------------------
-- updated_at trigger (shared)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER classes_set_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER class_progress_set_updated_at
  BEFORE UPDATE ON public.class_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER timetable_calendar_set_updated_at
  BEFORE UPDATE ON public.timetable_calendar
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — owner-only on all four tables.
-- ---------------------------------------------------------------------
ALTER TABLE public.classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_calendar    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classes_owner_all" ON public.classes
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "slots_owner_all" ON public.class_timetable_slots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classes c
                 WHERE c.id = class_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c
                      WHERE c.id = class_id AND c.teacher_id = auth.uid()));

CREATE POLICY "progress_owner_all" ON public.class_progress
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classes c
                 WHERE c.id = class_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c
                      WHERE c.id = class_id AND c.teacher_id = auth.uid()));

CREATE POLICY "calendar_owner_all" ON public.timetable_calendar
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- =====================================================================
-- get_teaching_week: the homepage query.
-- =====================================================================
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
      c.discipline::text AS discipline,
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
