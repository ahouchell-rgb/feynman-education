-- =====================================================================
-- Feynman Education — Demo Maths content (proves the multi-subject engine)
-- Applied to prod: 2026-06-25
--
-- Seeds a Year 9 Maths year-group + two units + lessons, attached to the
-- Maths subject seeded in 20260620_subject_foundation.sql. With this + the
-- subject-aware generators (T6.3) + subject theming (T6.2), the toolkit
-- produces real Maths material and the UI renders Maths as a second subject.
-- Catalog tables (groups/units/lessons) — seeded as service role.
-- =====================================================================

-- De-science the units table: discipline was a NOT NULL enum (physics/chemistry/
-- biology), which made a non-science unit impossible. Drop the constraint so a
-- unit can be subject-tagged without a science discipline. Existing science units
-- keep their discipline; the get_teaching_week RPC and the app (subjectName /
-- unitAccent) already treat a NULL discipline as "use subject_id". Idempotent.
ALTER TABLE public.units ALTER COLUMN discipline DROP NOT NULL;

-- A dedicated Maths year-group (so it reads clearly as a second subject).
INSERT INTO public.groups (id, label, key_stage, sort_order) VALUES
  ('maths_y9', 'Maths · Year 9', 'ks3', 100)
ON CONFLICT (id) DO NOTHING;

-- Two Maths units (discipline NULL — it's not a science discipline; subject_id
-- points at Maths so the engine + UI treat it as Mathematics). Note: units has
-- no keywords column (that lives on lessons), so keywords are seeded per-lesson.
INSERT INTO public.units (id, group_id, subject_id, title, discipline, year_group, term, sort_order, hours, big_idea, content, misconceptions)
SELECT v.id, 'maths_y9', (SELECT id FROM public.subjects WHERE slug = 'maths'),
       v.title, NULL, 9, v.term::term, v.so, v.hours, v.big_idea, v.content, v.misc
FROM (VALUES
  ('m9_quadratics', 'Quadratic graphs', 'spring', 1, 6,
   'A quadratic makes a parabola; its key features (roots, turning point, intercepts) come from its equation.',
   'Plotting y = ax^2 + bx + c. Roots as x-intercepts and solutions of ax^2+bx+c=0. The turning point (vertex) and line of symmetry. Factorising to find roots. Sketching from factorised form. Interpreting real-world parabolas (projectile height, area).',
   ARRAY['A quadratic graph is a straight line','The turning point is always at x=0','More x-terms means steeper everywhere']),
  ('m9_simultaneous', 'Simultaneous equations', 'summer', 2, 5,
   'Two equations in two unknowns pin down a single point where both are true.',
   'Solving by elimination and by substitution. Equations representing two lines; the solution is their intersection. Setting up simultaneous equations from worded problems. Checking solutions back in both equations.',
   ARRAY['You can solve one equation for two unknowns','Substitution and elimination give different answers','Any pair of numbers that fits one equation is a solution'])
) AS v(id, title, term, so, hours, big_idea, content, misc)
ON CONFLICT (id) DO NOTHING;

-- A few lessons for the quadratics unit.
INSERT INTO public.lessons (unit_id, title, lesson_number, sort_order, objectives, keywords)
SELECT 'm9_quadratics', v.title, v.n, v.n, v.obj, v.kw
FROM (VALUES
  ('Plotting quadratic graphs', 1, 'Plot y = x^2 and y = ax^2+bx+c from a table of values; recognise the parabola shape.', ARRAY['parabola','table of values']),
  ('Roots and the turning point', 2, 'Read roots as x-intercepts; find the line of symmetry and turning point.', ARRAY['roots','turning point','symmetry']),
  ('Factorising to solve', 3, 'Factorise quadratics and use them to find roots and sketch the curve.', ARRAY['factorise','roots','sketch'])
) AS v(title, n, obj, kw)
WHERE NOT EXISTS (SELECT 1 FROM public.lessons WHERE unit_id = 'm9_quadratics');

COMMENT ON TABLE public.units IS 'Curriculum units — now multi-subject via subject_id (science + demo Maths).';
