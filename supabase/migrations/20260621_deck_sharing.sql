-- Deck sharing + forking growth loop.
-- A teacher can flip a deck "public" and hand out a non-guessable link; anyone
-- (signed in or not) can VIEW it read-only and "Make a copy" into their own
-- account. We add two columns to public.decks:
--   is_public    bool  — the on/off switch (default false; existing decks stay private)
--   share_token  uuid  — the capability token embedded in the share URL
-- and one extra RLS policy that lets ANY reader (anon or authenticated) SELECT a
-- deck row only while is_public = true. Owner read/write policies are untouched,
-- so a public deck stays read-only for everyone but its owner, and forking always
-- creates a brand-new owned row (never mutates the original).

alter table public.decks add column if not exists is_public boolean not null default false;
alter table public.decks add column if not exists share_token uuid;

-- One token per deck; the link is the capability, so it must be unique.
create unique index if not exists decks_share_token_key on public.decks (share_token);
-- The shared viewer looks decks up by token, gated on is_public.
create index if not exists decks_public_token_idx on public.decks (share_token) where is_public;

comment on column public.decks.is_public is
  'When true, the deck is readable by anyone holding its share_token (read-only; fork to edit).';
comment on column public.decks.share_token is
  'Non-guessable capability token embedded in /slides/shared/<token>. Minted on first share.';

-- Public read: any reader (anon or authenticated) may SELECT a row that is
-- public. This is additive to the existing owner policies — it never grants
-- INSERT/UPDATE/DELETE, so non-owners can read a shared deck but cannot mutate it.
drop policy if exists decks_public_read on public.decks;
create policy decks_public_read on public.decks
  for select to anon, authenticated using (is_public = true);

-- The anon role can already reach PostgREST; make sure it may read the table at
-- the GRANT layer too (RLS still restricts it to public rows via the policy above).
grant select on public.decks to anon;
