-- Auto-generated half-term feedforward PPTX decks (base64 in-row to avoid a bucket).
-- Written by the cron (/api/cron/halfterm-feedforward) as service role; read by
-- the owning teacher (RLS), downloaded via /api/feedforward-deck/[id].
create table if not exists public.feedforward_decks (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  class_id    uuid,                       -- retrieval class id (other DB; no FK)
  class_label text,
  half_term   text,
  topics      jsonb not null default '[]'::jsonb,
  pptx_base64 text not null,
  created_at  timestamptz not null default now()
);
comment on table public.feedforward_decks is
  'Auto-generated half-term feedforward PPTX decks (base64). Cron-written, teacher-read.';

alter table public.feedforward_decks enable row level security;

drop policy if exists feedforward_decks_owner on public.feedforward_decks;
create policy feedforward_decks_owner on public.feedforward_decks
  for select to authenticated using (teacher_id = auth.uid());
drop policy if exists feedforward_decks_owner_del on public.feedforward_decks;
create policy feedforward_decks_owner_del on public.feedforward_decks
  for delete to authenticated using (teacher_id = auth.uid());

grant select, delete on public.feedforward_decks to authenticated;
