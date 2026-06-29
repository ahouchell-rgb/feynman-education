-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy — verified 2026-06-18
-- (support_tickets table present). Powers the in-app "Help & support" feature
-- (the AdminPanel Support tab and the Help button both read/write this table).
--
-- In-app support: any signed-in user can file a ticket as themselves; only
-- moderators can read and resolve them (surfaced in the Admin → Support tab).
-- Mirrors the RLS style used elsewhere (auth.uid() + is_moderator()).

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  email        text,
  display_name text,
  role         text,
  page         text,                       -- where in the app it was raised
  message      text not null,
  status       text not null default 'open',  -- 'open' | 'resolved'
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

alter table public.support_tickets enable row level security;

-- File a ticket as yourself.
drop policy if exists support_insert_self on public.support_tickets;
create policy support_insert_self on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid());

-- Only moderators can read tickets.
drop policy if exists support_select_mod on public.support_tickets;
create policy support_select_mod on public.support_tickets
  for select to authenticated
  using (is_moderator());

-- Only moderators can triage / resolve.
drop policy if exists support_update_mod on public.support_tickets;
create policy support_update_mod on public.support_tickets
  for update to authenticated
  using (is_moderator())
  with check (is_moderator());

grant insert, select, update on public.support_tickets to authenticated;

create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
