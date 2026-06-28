-- Status: APPLIED (2026-06-17) to project uvzukwoxqhcxaxtzrziy — 73 links / 41 topics.
-- Seed topic_resources from the live interactive-science.com hub.
-- Curated topic -> resource pairings (manual). Each topic gets its most specific
-- interactive tool/widget first (sort 1) and, where one exists, the unit's
-- revision booklet second (sort 2). Joined by topic NAME (same idiom as the KS3
-- assisted crosswalk in 20260615_03); a name that doesn't match is simply skipped.
--
-- Mirrors the curriculum-correction decision (20260615_09): the retired Y8.x
-- topic scheme is intentionally left unmapped. Topics with no good interactive
-- match (energy changes, ecology, genetics, space, electricity, thermal) are
-- omitted on purpose rather than mis-linked.

-- KS3 objective-topics (the fine-grained scheme pupils practise daily).
insert into public.topic_resources (retrieval_topic_id, url, kind, title, sort_order, mapped_by, confidence)
select t.id, 'https://interactive-science.com/' || m.path, m.kind, m.title, m.sort_order,
       'manual:interactive-science', 'manual'
from public.topics t
join (values
  -- Cells & microscopy
  ('B1.1 Microscopes','tool','The Microscope','microscope.html',1),
  ('B1.1 Microscopes','booklet','Cells — revision booklet','cells-revision.html',2),
  ('B1.2 Cell structure','tool','Zoom into the Cell','cell-zoom.html',1),
  ('B1.2 Cell structure','booklet','Cells — revision booklet','cells-revision.html',2),
  ('B1.3 Cells','tool','Zoom into the Cell','cell-zoom.html',1),
  ('B1.3 Cells','booklet','Cells — revision booklet','cells-revision.html',2),
  ('B1.4 Magnification','tool','The Microscope','microscope.html',1),
  ('B1.4 Magnification','booklet','Cells — revision booklet','cells-revision.html',2),
  ('B1.5 Unicellular Organisms','tool','Zoom into the Cell','cell-zoom.html',1),
  ('B1.5 Unicellular Organisms','booklet','Cells — revision booklet','cells-revision.html',2),
  ('B1.7 Specialised Cells','tool','Specialised Cells','specialised-cells.html',1),
  ('B1.7 Specialised Cells','booklet','Cells — revision booklet','cells-revision.html',2),
  -- Gas exchange (the alveoli example from the brief)
  ('B4.1 Ventilation','widget','Breathing model','interactives/breathing-model.html',1),
  ('B4.1 Ventilation','booklet','Gas exchange — revision booklet','gas-exchange-revision.html',2),
  ('B4.2 Gas Exchange','tool','Gas Exchange in the Alveoli','gas-exchange-alveoli.html',1),
  ('B4.2 Gas Exchange','booklet','Gas exchange — revision booklet','gas-exchange-revision.html',2),
  ('B4.3 Exercise, Asthma and Smoking','widget','Breathing rate','interactives/breathing-rate.html',1),
  ('B4.3 Exercise, Asthma and Smoking','booklet','Gas exchange — revision booklet','gas-exchange-revision.html',2),
  -- Particle model
  ('C1.1 Simple particle model','tool','Particle Model','particle-model.html',1),
  ('C1.1 Simple particle model','booklet','Particles — revision booklet','particle-model-revision.html',2),
  ('C1.2 Properties of states','tool','Particle Model','particle-model.html',1),
  ('C1.2 Properties of states','booklet','Particles — revision booklet','particle-model-revision.html',2),
  ('C1.3 Changes of state','tool','Particle Model','particle-model.html',1),
  ('C1.3 Changes of state','booklet','Particles — revision booklet','particle-model-revision.html',2),
  ('C1.4 Gas pressure','tool','Particle Model','particle-model.html',1),
  ('C1.4 Gas pressure','booklet','Particles — revision booklet','particle-model-revision.html',2),
  -- Atoms & compounds
  ('C2.1 Atomic model','tool','Atom Counter','atom-counter.html',1),
  ('C2.1 Atomic model','booklet','Atoms — revision booklet','atoms-revision.html',2),
  ('C2.2 Symbols and formulae','tool','Naming Compounds','naming-compounds.html',1),
  ('C2.2 Symbols and formulae','booklet','Atoms — revision booklet','atoms-revision.html',2),
  ('C2.3 Elements and compounds','tool','Naming Compounds','naming-compounds.html',1),
  ('C2.3 Elements and compounds','booklet','Atoms — revision booklet','atoms-revision.html',2),
  -- Substances — diffusion
  ('C3.1 Diffusion','tool','Diffusion & SA:V','diffusion.html',1),
  -- Chemical reactions
  ('C4.1 Chemical reactions','widget','Physical vs chemical change','interactives/physical-vs-chemical.html',1),
  ('C4.1 Chemical reactions','booklet','Chemical reactions — revision booklet','chemical-reactions-revision.html',2),
  ('C4.2 Types of reaction','widget','Reactivity & displacement','interactives/reactivity-displacement.html',1),
  ('C4.2 Types of reaction','booklet','Chemical reactions — revision booklet','chemical-reactions-revision.html',2),
  ('C4.3 Conservation of mass','widget','Mass balance','interactives/mass-balance.html',1),
  ('C4.3 Conservation of mass','booklet','Chemical reactions — revision booklet','chemical-reactions-revision.html',2),
  ('C4.4 Acids and alkalis','widget','pH slider','interactives/ph-slider.html',1),
  ('C4.4 Acids and alkalis','booklet','Acids & alkalis — revision booklet','acids-and-alkalis-revision.html',2),
  ('C4.5 Reactions of acids','widget','Neutralisation','interactives/neutralisation.html',1),
  ('C4.5 Reactions of acids','booklet','Acids & alkalis — revision booklet','acids-and-alkalis-revision.html',2),
  -- Energy & power
  ('P1.1 Fuels and energy stores','tool','Energy Stores','energy-stores.html',1),
  ('P1.1 Fuels and energy stores','booklet','Energy — revision booklet','energy-revision.html',2),
  ('P1.2 Energy stores and transfers','tool','Energy Stores','energy-stores.html',1),
  ('P1.2 Energy stores and transfers','booklet','Energy — revision booklet','energy-revision.html',2),
  ('P1.3 Power','tool','What is Power?','power-intro.html',1),
  ('P1.3 Power','booklet','Power — revision booklet','power-revision.html',2),
  ('P1.4 Energy resources','booklet','Energy — revision booklet','energy-revision.html',1),
  -- Speed & forces
  ('P2.1 Speed','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P2.2 Distance-time graphs','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P2.3 Relative motion','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P3.1 Basic forces and diagrams','tool','Force Diagram Builder','force-diagram-builder.html',1),
  ('P3.1 Basic forces and diagrams','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',2),
  ('P3.2 Naming and categorising forces','tool','Force Diagram Builder','force-diagram-builder.html',1),
  ('P3.2 Naming and categorising forces','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',2),
  ('P3.3 Stretching and squashing forces','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P3.4 Hookes law and work done','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P3.5 Moments and simple machines','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',1),
  ('P3.6 Balanced forces','tool','Force Diagram Builder','force-diagram-builder.html',1),
  ('P3.6 Balanced forces','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',2),
  ('P3.7 Forces and motion','tool','Force Diagram Builder','force-diagram-builder.html',1),
  ('P3.7 Forces and motion','booklet','Forces & Motion — revision booklet','forces-and-motion-revision.html',2)
) as m(tname, kind, title, path, sort_order)
  on t.name = m.tname
where t.key_stage = 'KS3'
on conflict (retrieval_topic_id, url) do nothing;

-- KS4 objective-topics are unit-grained in this schema, so they link the
-- unit-level interactive + booklet for the clear matches only.
insert into public.topic_resources (retrieval_topic_id, url, kind, title, sort_order, mapped_by, confidence)
select t.id, 'https://interactive-science.com/' || m.path, m.kind, m.title, m.sort_order,
       'manual:interactive-science', 'manual'
from public.topics t
join (values
  ('B1 Cell Biology','tool','Zoom into the Cell','cell-zoom.html',1),
  ('B1 Cell Biology','booklet','Cells — revision booklet','cells-revision.html',2),
  ('C1 Atomic Structure and the Periodic Table','tool','Atom Counter','atom-counter.html',1),
  ('C1 Atomic Structure and the Periodic Table','booklet','Atoms — revision booklet','atoms-revision.html',2),
  ('C4 Chemical Changes','booklet','Chemical reactions — revision booklet','chemical-reactions-revision.html',1),
  ('P1 Energy','tool','Energy Stores','energy-stores.html',1),
  ('P1 Energy','booklet','Energy — revision booklet','energy-revision.html',2),
  ('P3 Particle Model of Matter','tool','Particle Model','particle-model.html',1),
  ('P3 Particle Model of Matter','booklet','Particles — revision booklet','particle-model-revision.html',2)
) as m(tname, kind, title, path, sort_order)
  on t.name = m.tname
where t.key_stage = 'KS4'
on conflict (retrieval_topic_id, url) do nothing;
