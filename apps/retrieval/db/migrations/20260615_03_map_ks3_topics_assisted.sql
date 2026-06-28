-- Assisted semantic crosswalk: KS3 retrieval topics -> ScienceKit Y7/Y8 units.
-- confidence='assisted' = reviewable. Topics in strands with no KS3 unit
-- (ecology B8, genetics B9/Y8.45-49, Earth C8/Y8.50-54, electricity P8,
-- magnetism P9, thermal Y8.29-35/P10.2, space P11, skills Y8.3) are left
-- unmapped on purpose and reported separately.
insert into public.topic_map (retrieval_topic_id, unit_id, mapped_by, confidence)
select t.id, m.unit_id, 'assisted:ks3-semantic', 'assisted'
from public.topics t
join (values
  ('B1.1 Microscopes','y7_microscopes'),('B1.4 Magnification','y7_microscopes'),
  ('B1.2 Cell structure','y7_cells'),('B1.3 Cells','y7_cells'),
  ('B1.5 Unicellular Organisms','y7_cells'),('B1.7 Specialised Cells','y7_cells'),
  ('B2.1 Skeleton','y7_skeleton'),('B2.2 Biomechanics','y7_skeleton'),('B2.3 Organisation','y7_skeleton'),
  ('B3.1 Nutrition','y8_diet'),
  ('B3.2 Digestive organs','y8_digestive'),('B3.3 Gut Bacteria','y8_digestive'),
  ('B4.1 Ventilation','y8_gas_exchange'),('B4.2 Gas Exchange','y8_gas_exchange'),
  ('B4.3 Exercise, Asthma and Smoking','y8_gas_exchange'),
  ('B7.1 Aerobic Respiration','y8_gas_exchange'),('B7.2 Anaerobic Respiration','y8_gas_exchange'),
  ('B5.1 Sexual Reproduction','y8_reproduction'),('B5.2 Fertilisation','y8_reproduction'),
  ('B5.3 Fetal Development','y8_reproduction'),('B5.4 Menstrual Cycle','y8_reproduction'),
  ('B5.5 Plant Reproduction','y8_reproduction'),
  ('B6.1 Photosynthesis','y8_photosyn'),('B6.2 Leaf Structure','y8_photosyn'),
  ('C1.1 Simple particle model','y7_particle'),('C1.2 Properties of states','y7_particle'),
  ('C1.3 Changes of state','y7_particle'),('C1.4 Gas pressure','y7_particle'),
  ('P10.1 Particle motion and density','y7_particle'),
  ('C2.1 Atomic model','y7_atoms'),('C6.1 Properties of metals and non-metals','y7_atoms'),
  ('C6.2 Groups, periods, metals and non-metals','y7_atoms'),
  ('Y8.21 Atoms and elements','y7_atoms'),('Y8.22 Subatomic particles','y7_atoms'),
  ('Y8.23 Atomic and mass number','y7_atoms'),('Y8.24 Electron configuration','y7_atoms'),
  ('Y8.25 Periodic table','y7_atoms'),
  ('C2.2 Symbols and formulae','y7_compounds'),('C2.3 Elements and compounds','y7_compounds'),
  ('Y8.26 Chemical symbols','y7_compounds'),('Y8.27 Compounds','y7_compounds'),
  ('C3.1 Diffusion','y7_substances'),('C3.2 Pure and impure','y7_substances'),('C3.3 Separation','y7_substances'),
  ('C4.1 Chemical reactions','y8_reactions'),('C4.2 Types of reaction','y8_reactions'),
  ('C4.3 Conservation of mass','y8_reactions'),('C7.1 Metal reactivity','y8_reactions'),
  ('C7.2 Metal extraction with carbon','y8_reactions'),('Y8.28 Word equations','y8_reactions'),
  ('Y8.36 Conservation of mass','y8_reactions'),('Y8.37 Balancing equations','y8_reactions'),
  ('Y8.38 Oxidation','y8_reactions'),('Y8.40 Displacement','y8_reactions'),
  ('Y8.41 Metals with acids','y8_reactions'),('Y8.42 Metals with water','y8_reactions'),
  ('Y8.43 Group 1 reactivity','y8_reactions'),('Y8.44 Metal properties','y8_reactions'),
  ('C4.4 Acids and alkalis','y8_acids'),('C4.5 Reactions of acids','y8_acids'),('Y8.39 Neutralisation','y8_acids'),
  ('C5.1 Energy changes','y8_energy_changes'),('C5.2 Endothermic and exothermic reactions','y8_energy_changes'),
  ('C5.2 Energy changes','y8_energy_changes'),
  ('P1.1 Fuels and energy stores','y7_energy'),('P1.2 Energy stores and transfers','y7_energy'),
  ('P1.3 Power','y7_power'),('P1.4 Energy resources','y8_energy_res'),
  ('P2.1 Speed','y7_speed'),('P2.2 Distance-time graphs','y7_speed'),('P2.3 Relative motion','y7_speed'),
  ('Y8.1 Speed','y7_speed'),('Y8.2 Measuring speed','y7_speed'),
  ('Y8.4 Distance-time graphs','y7_speed'),('Y8.5 Relative motion','y7_speed'),
  ('P3.1 Basic forces and diagrams','y7_forces'),('P3.2 Naming and categorising forces','y7_forces'),
  ('P3.3 Stretching and squashing forces','y7_forces'),('P3.4 Hookes law and work done','y7_forces'),
  ('P3.5 Moments and simple machines','y7_forces'),('P3.6 Balanced forces','y7_forces'),
  ('P3.7 Forces and motion','y7_forces'),
  ('Y8.6 Forces','y7_forces'),('Y8.7 Force diagrams','y7_forces'),('Y8.8 Types of force','y7_forces'),
  ('Y8.9 Interaction pairs','y7_forces'),('Y8.10 Resultant forces','y7_forces'),
  ('P4.1 Pressure in liquids','y8_pressure'),('P4.2 Atmospheric pressure','y8_pressure'),
  ('P4.3 Pressure calculations','y8_pressure'),
  ('P5.1 Types of wave','y8_waves_sound'),('P5.2 Sound waves','y8_waves_sound'),
  ('P5.3 Microphones and ultrasound','y8_waves_sound'),
  ('P6.1 Light and ray models','y8_light'),('P6.2 Interactions of light with materials','y8_light'),
  ('P6.3 Mirrors, pinhole cameras and the eye','y8_light')
) as m(tname, unit_id)
  on t.name = m.tname
where t.key_stage = 'KS3'
on conflict (retrieval_topic_id) do nothing;

-- Backfill readable unit titles for the KS3 rows just added.
update public.topic_map tm set unit_title = u.title
from (values
  ('y7_microscopes','Microscopes & Magnification'),('y7_cells','Cells'),
  ('y7_skeleton','Human Skeleton & Muscles'),('y7_atoms','Atoms & Elements'),
  ('y7_compounds','Elements & Compounds'),('y7_substances','Pure & Impure Substances'),
  ('y7_particle','Particle Model'),('y7_energy','Energy'),('y7_power','Power'),
  ('y7_speed','Speed'),('y7_forces','Forces'),
  ('y8_diet','Diet & Health'),('y8_digestive','Digestive Organs & Gut Bacteria'),
  ('y8_gas_exchange','Gas Exchange Systems'),('y8_reproduction','Reproduction'),
  ('y8_photosyn','Photosynthesis'),('y8_reactions','Chemical Reactions'),
  ('y8_acids','Chemical Reactions: Acids & Alkalis'),('y8_energy_changes','Energy Changes'),
  ('y8_energy_res','Energy Resources'),('y8_pressure','Pressure'),
  ('y8_waves_sound','Types of Waves — Sound'),('y8_light','Light')
) as u(unit_id, title)
where tm.unit_id = u.unit_id and tm.unit_title is null;
