-- ── Phase 3 infrastructure (non-destructive scaffolding) ──

-- class_link: a FORMAL join between a ScienceKit class and a retrieval class,
-- replacing the cross-DB `retrieval_class_ids uuid[]` pointer that has no
-- referential integrity. sciencekit_class_id is a uuid in the OTHER (ScienceKit)
-- project, so no FK on that side. Populated by a back-fill (run separately;
-- env-specific ids are not committed). Seed of "one canonical class".
create table if not exists public.class_link (
  retrieval_class_id    uuid not null references public.classes(id) on delete cascade,
  sciencekit_class_id   uuid not null,            -- ScienceKit classes.id (other DB)
  sciencekit_teacher_id uuid,                     -- ScienceKit profiles.id (optional)
  note        text,
  created_at  timestamptz not null default now(),
  primary key (retrieval_class_id, sciencekit_class_id)
);
comment on table public.class_link is
  'Formal SK<->retrieval class join (replaces the retrieval_class_ids[] pointer). sciencekit_* ids live in the ScienceKit project; no cross-DB FK.';

alter table public.class_link enable row level security;
drop policy if exists class_link_read on public.class_link;
create policy class_link_read on public.class_link for select to authenticated using (true);
grant select on public.class_link to authenticated;

-- Back-fill (run manually, env-specific ids): read SK classes.retrieval_class_ids
-- and insert (retrieval_class_id, sciencekit_class_id, sciencekit_teacher_id),
-- joined to public.classes to drop any stale pointers. Not committed with ids.

-- teaching_log: canonical read model over the POPULATED lesson_deliveries,
-- joined to topic + mapped unit. `source` lets ScienceKit's taught_log (a
-- separate, empty duplicate) sync in here later under one schema.
-- security_invoker so teacher RLS on lesson_deliveries/classes applies.
create or replace view public.teaching_log
with (security_invoker = true) as
select
  ld.id,
  ld.class_id,
  c.name        as class_name,
  ld.topic_id,
  t.name        as topic_name,
  tm.unit_id,
  tm.unit_title,
  ld.teacher_id,
  ld.taught_at,
  ld.notes,
  'retrieval'::text as source
from public.lesson_deliveries ld
join public.classes c       on c.id = ld.class_id
left join public.topics t   on t.id = ld.topic_id
left join public.topic_map tm on tm.retrieval_topic_id = ld.topic_id;

comment on view public.teaching_log is
  'Canonical teaching-log read model over lesson_deliveries (+ topic/unit). source column reserved for syncing ScienceKit taught_log into one schema.';

grant select on public.teaching_log to authenticated;
