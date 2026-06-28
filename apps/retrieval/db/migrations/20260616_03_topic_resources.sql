-- Status: APPLIED (2026-06-17) to project uvzukwoxqhcxaxtzrziy.
-- Topic-level resource registry: links a retrieval objective-topic to the
-- matching interactive-science.com tool / widget / revision booklet.
--
-- Deliberately TOPIC level, not unit level (cf. topic_map, which is the coarser
-- objective-topic -> ScienceKit *unit* crosswalk). "Weak on alveoli" should link
-- the alveoli tool specifically, not every gas-exchange resource. A topic may
-- have several rows (e.g. an interactive tool + the unit's revision booklet);
-- sort_order controls the order they surface to the pupil.
--
-- url is an absolute interactive-science.com link (cross-site; that hub is its
-- own repo/deploy, so no FK is possible — integrity is by convention, the same
-- approach topic_map takes with unit_id).
create table if not exists public.topic_resources (
  retrieval_topic_id uuid not null references public.topics(id) on delete cascade,
  url        text not null,
  kind       text not null default 'tool'
             check (kind in ('tool','widget','booklet','pdf')),
  title      text not null,
  sort_order int  not null default 1,
  mapped_by  text not null default 'manual',
  confidence text not null default 'manual'
             check (confidence in ('auto','assisted','manual')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (retrieval_topic_id, url)
);

comment on table public.topic_resources is
  'Topic-level link from a retrieval objective-topic to an interactive-science.com tool/widget/revision booklet (cross-site; url is absolute, no FK). Surfaced in the pupil "revise your weak spots" view.';

alter table public.topic_resources enable row level security;

-- Resource links are non-sensitive curriculum metadata; any signed-in user may
-- read (pupils need it for the weak-spots panel). Writes are service-role /
-- migration only (no write policy = locked to elevated roles), exactly as topic_map.
drop policy if exists topic_resources_read on public.topic_resources;
create policy topic_resources_read on public.topic_resources for select to authenticated using (true);

grant select on public.topic_resources to authenticated;
