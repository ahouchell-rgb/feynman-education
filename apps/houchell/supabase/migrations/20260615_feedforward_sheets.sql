-- Phase 2: persist generated feedforward sheets so they're reusable, not just
-- open-to-print. Owner-scoped (one teacher's sheets are private to them).
create table if not exists public.feedforward_sheets (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references public.lessons(id) on delete cascade,
  unit_id     text references public.units(id),
  teacher_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_label text,
  gaps        jsonb not null default '[]'::jsonb,   -- snapshot of the gaps it was built from
  html        text not null,
  created_at  timestamptz not null default now()
);

comment on table public.feedforward_sheets is
  'Saved feedforward practice sheets generated from a class''s weak objectives. Owner-scoped.';

alter table public.feedforward_sheets enable row level security;

drop policy if exists feedforward_owner_all on public.feedforward_sheets;
create policy feedforward_owner_all on public.feedforward_sheets
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

grant select, insert, delete on public.feedforward_sheets to authenticated;
