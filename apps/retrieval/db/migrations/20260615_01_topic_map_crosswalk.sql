-- Crosswalk: retrieval objective-topic -> ScienceKit planning unit.
-- unit_id is the ScienceKit (other DB) text id; no FK is possible cross-database,
-- so unit_code/unit_title are denormalised for readability + integrity-by-convention.
create table if not exists public.topic_map (
  retrieval_topic_id uuid primary key references public.topics(id) on delete cascade,
  unit_id    text not null,
  unit_code  text,
  unit_title text,
  lesson_id  uuid,                 -- optional finer link (ScienceKit lessons.id), nullable
  mapped_by  text not null default 'manual',
  confidence text not null default 'manual'
             check (confidence in ('auto','assisted','manual')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.topic_map is
  'Crosswalk from retrieval objective-topics to ScienceKit planning units (cross-DB; unit_id is a text id in the ScienceKit project, no FK).';

alter table public.topic_map enable row level security;

-- Curriculum mapping is non-sensitive; any signed-in user may read. Writes are
-- service-role / migration only (no write policy = locked to elevated roles).
drop policy if exists topic_map_read on public.topic_map;
create policy topic_map_read on public.topic_map for select to authenticated using (true);

grant select on public.topic_map to authenticated;

-- Auto-map the 13 KS4 topics by AQA code prefix (B1, C2, P3 ...).
insert into public.topic_map (retrieval_topic_id, unit_id, unit_code, unit_title, mapped_by, confidence)
select t.id, m.unit_id, m.code, m.unit_title, 'auto:ks4-code-match', 'auto'
from public.topics t
join (values
  ('B1','b1_cells','B1 Cell Biology'),
  ('B2','b2_org','B2 Organisation'),
  ('B3','b3_infection','B3 Infection & Response'),
  ('B4','b4_bioener','B4 Bioenergetics'),
  ('C1','c1_atoms','C1 Atomic Structure'),
  ('C2','c2_bonding','C2 Bonding & Structure'),
  ('C3','c3_quant','C3 Quantitative Chemistry'),
  ('C4','c4_chemical','C4 Chemical Changes'),
  ('C5','c5_energy_chem','C5 Energy Changes'),
  ('P1','p1_energy','P1 Energy'),
  ('P2','p2_electricity','P2 Electricity'),
  ('P3','p3_particle','P3 Particle Model of Matter'),
  ('P4','p4_atomic','P4 Atomic Structure')
) as m(code, unit_id, unit_title)
  on m.code = substring(t.name from '^[BCP][0-9]+')
where t.key_stage = 'KS4'
on conflict (retrieval_topic_id) do nothing;
