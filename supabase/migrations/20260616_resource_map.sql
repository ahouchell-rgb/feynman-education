-- Crosswalk: interactive-science.com resources -> ScienceKit planning units.
-- Lets the lesson page surface the interactive tools, revision booklets and
-- embeddable widgets for a unit, and lets a gap point at its re-teach resource.
create table if not exists public.resource_map (
  id        uuid primary key default gen_random_uuid(),
  href      text not null,
  name      text,
  rtype     text,                                -- interactive tool | revision | widget
  level     text,
  tag       text,
  accent    text,
  section   text,
  origin    text not null default 'https://interactive-science.com',
  unit_id   text references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (href, unit_id)
);
comment on table public.resource_map is
  'interactive-science.com resources mapped to ScienceKit units. Teaching content catalog (non-personal).';

alter table public.resource_map enable row level security;
drop policy if exists resource_map_read on public.resource_map;
create policy resource_map_read on public.resource_map for select to authenticated using (true);
grant select on public.resource_map to authenticated;

-- Seed: 43 resources + 16 widgets mapped to units (generated from resources.json).
insert into public.resource_map (href,name,rtype,level,tag,accent,section,unit_id) values
('cell-zoom.html','Zoom into the Cell','interactive tool','GCSE','cell → nucleus → DNA','#C84A6D','biology','b1_cells'),
('cell-zoom.html','Zoom into the Cell','interactive tool','GCSE','cell → nucleus → DNA','#C84A6D','biology','y7_cells'),
('specialised-cells.html','Specialised Cells','interactive tool','GCSE','six cell types, six adaptations','#C84A6D','biology','b1_cells'),
('specialised-cells.html','Specialised Cells','interactive tool','GCSE','six cell types, six adaptations','#C84A6D','biology','y7_cells'),
('microscope.html','The Microscope','interactive tool','GCSE','eyepiece, objective, focus','#C84A6D','biology','y7_microscopes'),
('microscope.html','The Microscope','interactive tool','GCSE','eyepiece, objective, focus','#C84A6D','biology','b1_cells'),
('diffusion.html','Diffusion & SA:V','interactive tool','GCSE','why small cells diffuse faster','#C84A6D','biology','b1_cells'),
('diffusion.html','Diffusion & SA:V','interactive tool','GCSE','why small cells diffuse faster','#C84A6D','biology','y7_substances'),
('osmosis.html','Osmosis','interactive tool','GCSE','water across a partially permeable membrane','#C84A6D','biology','b1_cells'),
('osmosis-required-practical.html','Osmosis Required Practical','interactive tool','GCSE','the potato practical · watch, order, explain','#C84A6D','biology','b1_cells'),
('gas-exchange-alveoli.html','Gas Exchange in the Alveoli','interactive tool','GCSE','four adaptations · maximise the rate','#C84A6D','biology','y8_gas_exchange'),
('dna-zoom.html','Zoom into DNA','interactive tool','GCSE','a double helix, in five steps','#C84A6D','biology','b6_inherit'),
('genetics-vocabulary.html','Genetics Vocab','interactive tool','KS3','twelve questions · staged reveals','#C84A6D','biology','b6_inherit'),
('genetics-recap.html','Genetics Recap','interactive tool','KS3','whole-unit recap · diagnose, recall, practise','#C84A6D','biology','b6_inherit'),
('embryo-screening-evaluate.html','Evaluate: Embryo Screening','interactive tool','KS3','PGD vs CVS — writing an evaluation','#C84A6D','biology','b6_inherit'),
('force-diagram-builder.html','Force Diagram Builder','interactive tool','GCSE','drag, label, balance','#C77A1E','physics','y7_forces'),
('force-diagram-builder.html','Force Diagram Builder','interactive tool','GCSE','drag, label, balance','#C77A1E','physics','p5_forces'),
('particle-model.html','Particle Model','interactive tool','GCSE','why solids, liquids, and gases behave that way','#C77A1E','physics','y7_particle'),
('particle-model.html','Particle Model','interactive tool','GCSE','why solids, liquids, and gases behave that way','#C77A1E','physics','p3_particle'),
('energy-stores.html','Energy Stores','interactive tool','KS3','a roller coaster, three stores, conservation','#C77A1E','physics','y7_energy'),
('energy-stores.html','Energy Stores','interactive tool','KS3','a roller coaster, three stores, conservation','#C77A1E','physics','p1_energy'),
('shc-builder.html','Specific Heat Capacity','interactive tool','GCSE','build the apparatus · sequence · 6-marker','#C77A1E','physics','p3_particle'),
('power-intro.html','What is Power?','interactive tool','KS3','two fans, two batteries — power as a rate','#C77A1E','physics','y7_power'),
('circuits-properly.html','Circuits, properly','interactive tool','GCSE','series, parallel & resistance — for real','#C77A1E','physics','p2_electricity'),
('em-field-circuits.html','Electricity, properly','interactive tool','GCSE','fields, energy & electrons','#C77A1E','physics','p2_electricity'),
('em-field-circuits.html','Electricity, properly','interactive tool','GCSE','fields, energy & electrons','#C77A1E','physics','p7_magnets'),
('rp-acceleration.html','RP: Acceleration','interactive tool','GCSE','resultant force & acceleration','#C77A1E','physics','p5_forces'),
('rp-force-extension.html','RP: Force & Extension','interactive tool','GCSE','Hooke''s law & the spring practical','#C77A1E','physics','p5_forces'),
('rp-waves.html','RP: Waves','interactive tool','GCSE','wavelength, frequency & wave speed','#C77A1E','physics','p6_waves'),
('atom-counter.html','Atom Counter','interactive tool','KS3','read a formula · count the atoms','#3672C2','chemistry','y7_atoms'),
('atom-counter.html','Atom Counter','interactive tool','KS3','read a formula · count the atoms','#3672C2','chemistry','c1_atoms'),
('naming-compounds.html','Naming Compounds','interactive tool','KS3','three rules · then the test','#3672C2','chemistry','y7_compounds'),
('atmosphere-evolution.html','Evolution of the Atmosphere','interactive tool','GCSE','four stages · volcanoes to present-day air','#3672C2','chemistry','c9_atmos'),
('carbon-cycle.html','The Carbon Cycle','interactive tool','GCSE','photosynthesis to combustion','#3672C2','chemistry','c9_atmos'),
('cells-revision.html','Cells, bitesize','revision','KS3','eight short topics · microscopes to specialised cells','#7E4FB8','revision','y7_cells'),
('particle-model-revision.html','Particles, bitesize','revision','KS3','four short topics · solids, liquids, gases, pressure','#7E4FB8','revision','y7_particle'),
('atoms-revision.html','Atoms, bitesize','revision','KS3','six short topics · atoms to the periodic table','#7E4FB8','revision','y7_atoms'),
('energy-revision.html','Energy, bitesize','revision','KS3','six short topics · stores, transfers, joules','#7E4FB8','revision','y7_energy'),
('power-revision.html','Power, bitesize','revision','KS3','six short topics · the equation, units, calculations','#7E4FB8','revision','y7_power'),
('genetics-revision.html','Genetics, bitesize','revision','KS3','five short topics · hide-reveal answers','#7E4FB8','revision','b6_inherit'),
('forces-and-motion-revision.html','Forces & Motion, bitesize','revision','KS3','ten short topics · motion then forces','#7E4FB8','revision','y7_forces'),
('gas-exchange-revision.html','Gas exchange, bitesize','revision','KS3','seven short topics · breathing to smoking','#7E4FB8','revision','y8_gas_exchange'),
('chemical-reactions-revision.html','Chemical reactions, bitesize','revision','KS3','nine short topics · reactions to balancing equations','#7E4FB8','revision','y8_reactions'),
('acids-and-alkalis-revision.html','Acids & alkalis, bitesize','revision','KS3','five short topics · the pH scale to making salts','#7E4FB8','revision','y8_acids'),
('interactives/air-composition.html','Air Composition','widget','KS3','embeddable widget','#5246c4','biology','y8_gas_exchange'),
('interactives/alveolus-diffusion.html','Alveolus Diffusion','widget','KS3','embeddable widget','#5246c4','biology','y8_gas_exchange'),
('interactives/breathing-model.html','Breathing Model','widget','KS3','embeddable widget','#5246c4','biology','y8_gas_exchange'),
('interactives/breathing-rate.html','Breathing Rate','widget','KS3','embeddable widget','#5246c4','biology','y8_gas_exchange'),
('interactives/respiratory-system.html','Respiratory System','widget','KS3','embeddable widget','#5246c4','biology','y8_gas_exchange'),
('interactives/equation-balancer.html','Equation Balancer','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/fire-triangle.html','Fire Triangle','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/mass-balance.html','Mass Balance','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/physical-vs-chemical.html','Physical Vs Chemical','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/reactivity-displacement.html','Reactivity Displacement','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/rearrange-atoms.html','Rearrange Atoms','widget','KS3','embeddable widget','#5246c4','chemistry','y8_reactions'),
('interactives/indicator-lab.html','Indicator Lab','widget','KS3','embeddable widget','#5246c4','chemistry','y8_acids'),
('interactives/metal-acid.html','Metal Acid','widget','KS3','embeddable widget','#5246c4','chemistry','y8_acids'),
('interactives/neutralisation.html','Neutralisation','widget','KS3','embeddable widget','#5246c4','chemistry','y8_acids'),
('interactives/ph-slider.html','Ph Slider','widget','KS3','embeddable widget','#5246c4','chemistry','y8_acids'),
('interactives/salt-namer.html','Salt Namer','widget','KS3','embeddable widget','#5246c4','chemistry','y8_acids')
on conflict (href,unit_id) do nothing;
