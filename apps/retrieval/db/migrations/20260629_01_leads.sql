-- STATUS: documents the live `leads` table (project uvzukwoxqhcxaxtzrziy). The
-- table already exists in production — the public pricing page has been inserting
-- pilot/quote requests into it for some time — but it had never been captured as a
-- migration. This file makes it reproducible in a fresh environment and is written
-- idempotently (create table if not exists / drop policy if exists) so re-running it
-- against the live project is a no-op.
--
-- Sales / expansion leads. Two write paths feed this table:
--   • Public pricing page (src/app/pricing/page.js)  — anonymous visitor, source 'pricing_page'
--   • In-product paywall   (src/components/RequestCore.js) — authenticated teacher hitting
--     the customQuestions (Core) lock, source 'in_app_paywall' (highest-intent signal)
-- Reads are moderator-only and surfaced in the Admin → Leads tab (src/components/AdminPanel.js).
-- Mirrors the RLS style used by support_tickets (anon/authenticated insert + is_moderator() read).

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  school_name   text,
  contact_name  text,
  email         text,
  role          text,                         -- self-reported role, e.g. 'Head of Science'
  pupils        integer,                      -- approx science cohort size (pricing page only)
  plan_interest text,                         -- 'essentials' | 'core' | 'single_cohort' | 'pilot'
  message       text,
  source        text,                         -- 'pricing_page' | 'in_app_paywall'
  created_at    timestamptz not null default now()
);

alter table public.leads enable row level security;

-- Anyone (signed-in or anonymous) can submit a lead. Inserts use Prefer:return=minimal
-- so the row is never read back — that keeps the moderator-only SELECT policy intact.
drop policy if exists leads_insert_anon on public.leads;
create policy leads_insert_anon on public.leads
  for insert to anon, authenticated
  with check (true);

-- Only moderators can read the captured leads (the operator inbox).
drop policy if exists leads_select_mod on public.leads;
create policy leads_select_mod on public.leads
  for select to authenticated
  using (is_moderator());

grant insert on public.leads to anon, authenticated;
grant select on public.leads to authenticated;

create index if not exists leads_created_at_idx on public.leads (created_at desc);
