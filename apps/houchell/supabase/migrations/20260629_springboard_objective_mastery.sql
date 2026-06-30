-- =====================================================================
-- Houchell Education — Springboard answers → the objective mastery graph
-- Applied to prod: (pending — DO NOT auto-apply; written for review)
--
-- Today the self-study Springboard course (public/learn/springboard.html) only
-- persists an opaque `state` jsonb blob in springboard_progress. That siloes
-- self-study practice away from the rest of the product: the per-pupil ×
-- per-objective mastery graph (built from public.responses → questions → topics →
-- objectives, surfaced by objective_mastery / student_weak_topics) never sees it.
--
-- This migration wires Springboard into that SAME objective spine WITHOUT
-- inventing a parallel mastery table:
--
--   * We CANNOT write Springboard answers into public.responses: that table FKs
--     question_id → public.questions(id), and Springboard's questions live inline
--     in the static HTML (CONTENT) — they are not rows in `questions`, have no
--     topic_id, and so cannot resolve through the questions→topics→objectives
--     join. Forcing them in would corrupt the retrieval grade-integrity invariants.
--
--   * Instead we add springboard_response — the Springboard analogue of
--     public.responses (one row per answered question) — keyed by the pupil's
--     springboard student_id and the course's own stable question id
--     (qid = "<unitCode>#<questionIndex>", e.g. "B1#3"). It carries is_correct +
--     answered_at, exactly the signal the graph needs.
--
--   * A crosswalk springboard_objective_map (unit_code → objective_id) rolls each
--     Springboard unit up to a canonical public.objectives row — the SAME node the
--     retrieval `responses` path and the assessment QLA path both roll up to. A
--     view (springboard_objective_mastery) then aggregates per pupil × objective,
--     mirroring the existing public.objective_mastery view, so dashboards can blend
--     self-study practice into the one mastery graph by objective_id.
--
-- GRANULARITY / LIMITATION: Springboard tags at UNIT grain (its KS3 unit codes:
-- B1, MIC, P1, …) plus the question index. The course content has no per-objective
-- ids, so the finest honest mastery grain is unit→objective (we map to each unit's
-- unit-level fallback objective, lesson_id null). The qid is still stored on every
-- row, so a future content-level objective tagging can refine the rollup without a
-- schema change. The crosswalk is best-effort backfilled by matching Springboard
-- unit titles to objectives.title; unmatched codes are left for manual mapping
-- (a NOTICE lists how many) rather than guessed.
--
-- Depends on: 20260628_springboard_progress (springboard_pupil),
--             20260621_mastery_graph_objectives (objectives, unit-level fallbacks).
-- All statements additive + idempotent; safe to replay.
-- =====================================================================

-- --------------------------------------------------------------------
-- springboard_response: one row per answered Springboard question.
-- The Springboard analogue of public.responses. student_id is the springboard
-- pupil id (NOT auth.users) — Springboard pupils have no login, only a token.
-- Written by the service role via /api/springboard/* (same trust model as
-- springboard_progress). qid is the course's own id "<unitCode>#<idx>".
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.springboard_response (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.springboard_pupil(student_id) ON DELETE CASCADE,
  unit_code    text NOT NULL,                       -- Springboard unit code, e.g. 'B1','MIC'
  qid          text NOT NULL,                        -- '<unitCode>#<questionIndex>', e.g. 'B1#3'
  is_correct   boolean NOT NULL,
  -- session is one of: 'lesson' | 'review' | 'weak' | 'recap' | 'exam' (context the
  -- answer came from). Lets dashboards separate first-encounter from retrieval practice.
  session      text NOT NULL DEFAULT 'lesson',
  answered_at  timestamptz NOT NULL DEFAULT now()
);

-- Upsert key: at most one row per pupil × qid — re-answering the same question
-- (e.g. in review) updates the latest outcome rather than growing unboundedly.
-- (Mastery uses the latest outcome per question; the blob keeps the full Leitner
-- history. If a full attempt history is ever wanted, drop this unique index.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_springboard_response_student_qid
  ON public.springboard_response(student_id, qid);
CREATE INDEX IF NOT EXISTS idx_springboard_response_student ON public.springboard_response(student_id);
CREATE INDEX IF NOT EXISTS idx_springboard_response_unit    ON public.springboard_response(unit_code);

COMMENT ON TABLE public.springboard_response IS
  'Per-question self-study outcomes from the Springboard home course. The Springboard analogue of public.responses; rolled up to objectives via springboard_objective_map so self-study feeds the one mastery graph. Service-role write only.';

-- --------------------------------------------------------------------
-- springboard_objective_map: Springboard unit_code → canonical objective.
-- The crosswalk that puts self-study practice onto the shared objective spine,
-- mirroring topic_objective_map (retrieval) for the Springboard course.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.springboard_objective_map (
  unit_code    text PRIMARY KEY,                                  -- Springboard unit code
  objective_id uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  unit_title   text,                                              -- denormalised, for readability
  mapped_by    text NOT NULL DEFAULT 'manual',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_springboard_obj_map_objective ON public.springboard_objective_map(objective_id);

COMMENT ON TABLE public.springboard_objective_map IS
  'Crosswalk: Springboard unit_code → canonical objective_id. Lets self-study practice roll up into the per-objective mastery graph alongside retrieval + assessment.';

-- --------------------------------------------------------------------
-- RLS — read-only to teachers for their own classes (same shape as
-- springboard_progress); ALL writes go through the service role in the API.
-- --------------------------------------------------------------------
ALTER TABLE public.springboard_response       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.springboard_objective_map  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS springboard_response_teacher_read ON public.springboard_response;
CREATE POLICY springboard_response_teacher_read ON public.springboard_response
  FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT sp.student_id FROM public.springboard_pupil sp
    WHERE sp.class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  ));

-- The crosswalk is non-personal catalog data: readable by any signed-in user
-- (the dashboards need it), writes are service-role / migration only.
DROP POLICY IF EXISTS springboard_obj_map_read ON public.springboard_objective_map;
CREATE POLICY springboard_obj_map_read ON public.springboard_objective_map
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.springboard_objective_map TO authenticated;

-- --------------------------------------------------------------------
-- Best-effort backfill of the crosswalk. Match each Springboard unit title to a
-- unit-level (fallback) objective by title, case-insensitively. Guarded on the
-- objectives table existing; idempotent (ON CONFLICT DO NOTHING). Unit codes with
-- no title match are left unmapped (a NOTICE reports the count) for a human to map.
--
-- The (code, title) pairs below are the authored Springboard units (kept in sync
-- with PATHWAY in public/learn/springboard.html).
-- --------------------------------------------------------------------
DO $$
DECLARE v_mapped int; v_units int;
BEGIN
  IF to_regclass('public.objectives') IS NULL THEN
    RAISE NOTICE '[springboard-mastery] objectives table absent — crosswalk backfill skipped (map by hand or replay once the mastery graph lands).';
    RETURN;
  END IF;

  INSERT INTO public.springboard_objective_map (unit_code, objective_id, unit_title, mapped_by)
  SELECT s.code, o.id, s.title, 'auto:title_match'
  FROM (VALUES
    ('P1','Energy'), ('C1','The particle model'), ('B1','Cells'), ('PWR','Power'),
    ('C2','Atoms and elements'), ('MIC','Microscopes & magnification'),
    ('ELC','Elements and compounds'), ('SPD','Speed'),
    ('SKL','Human skeleton and muscles'), ('PUR','Pure and impure substances'),
    ('FRC','Forces'), ('DIET','Diet and health'), ('ENR','Energy resources'),
    ('CHR','Chemical reactions'), ('PRS','Pressure'),
    ('DIG','Digestion and gut bacteria'), ('SND','Waves and sound'),
    ('GAS','Gas exchange systems'), ('ACD','Acids and alkalis'), ('LGT','Light'),
    ('REP','Reproduction'), ('ENC','Energy changes'), ('PHO','Photosynthesis'),
    ('SPC','Space'), ('PER','The periodic table'), ('ELE','Electricity in circuits'),
    ('RES','Respiration'), ('MAT','Materials'), ('STA','Static electricity'),
    ('ECO','Ecosystems'), ('EAR','Earth and atmosphere'), ('MAG','Magnets'),
    ('INH','Inheritance')
  ) AS s(code, title)
  -- prefer a unit-level (lesson_id null) objective whose title matches
  JOIN LATERAL (
    SELECT o.id, o.title
    FROM public.objectives o
    WHERE lower(btrim(o.title)) = lower(btrim(s.title))
    ORDER BY (o.lesson_id IS NULL) DESC, o.sort_order
    LIMIT 1
  ) o ON true
  ON CONFLICT (unit_code) DO NOTHING;

  GET DIAGNOSTICS v_mapped = ROW_COUNT;
  SELECT count(*) INTO v_units FROM public.springboard_objective_map;
  RAISE NOTICE '[springboard-mastery] crosswalk: % new unit→objective rows (% mapped total). Unmatched Springboard codes need a manual springboard_objective_map row.', v_mapped, v_units;
END $$;

-- --------------------------------------------------------------------
-- springboard_objective_mastery: per pupil × objective mastery from self-study,
-- mirroring public.objective_mastery (which does the same for retrieval responses).
-- security_invoker ⇒ the caller's RLS on springboard_response applies, so a teacher
-- sees only their own classes' pupils (no leak via the view).
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.springboard_objective_mastery
WITH (security_invoker = true) AS
SELECT
  r.student_id,
  m.objective_id,
  o.title                                          AS objective,
  o.unit_id,
  o.key_stage,
  count(*)                                          AS attempts,
  count(*) FILTER (WHERE r.is_correct)             AS correct,
  round(100.0 * count(*) FILTER (WHERE r.is_correct)
        / nullif(count(*), 0), 0)                  AS pct_correct,
  max(r.answered_at)::date                          AS last_seen
FROM public.springboard_response r
JOIN public.springboard_objective_map m ON m.unit_code = r.unit_code
JOIN public.objectives o ON o.id = m.objective_id
GROUP BY r.student_id, m.objective_id, o.title, o.unit_id, o.key_stage;

COMMENT ON VIEW public.springboard_objective_mastery IS
  'Per pupil × per objective mastery from Springboard self-study (attempts/correct/%/last_seen). Mirrors objective_mastery for the home course; blends into the mastery graph by objective_id. RLS-respecting.';

GRANT SELECT ON public.springboard_objective_mastery TO authenticated;
