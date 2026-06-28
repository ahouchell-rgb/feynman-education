-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Tier-2: make the topic -> resource map TENANT-FILLABLE. Until now topic_resources
-- was migration/service-role seeded only (Adam's interactive-science links), read by
-- every authenticated user. For the standalone product a school must be able to add
-- its OWN links (a revision site, its VLE, a worksheet), visible only to that school,
-- alongside the global "batteries-included" set that ships with the product.
--
--  * add id (surrogate PK), school_id (owning tenant; NULL = global), created_by.
--  * read scope: global (school_id IS NULL) OR the caller's own school.
--  * writes go through SECURITY DEFINER RPCs that stamp school_id = user_school_id()
--    and created_by = auth.uid(), gated to staff with a real school. Global rows stay
--    migration-only; a school can only edit/remove its own rows.

alter table public.topic_resources add column if not exists id uuid not null default gen_random_uuid();
alter table public.topic_resources add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.topic_resources add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Swap PK (retrieval_topic_id,url) -> surrogate id: the old composite can't hold a
-- per-school duplicate of the same url, and a nullable school_id can't sit in a PK.
alter table public.topic_resources drop constraint if exists topic_resources_pkey;
alter table public.topic_resources add constraint topic_resources_pkey primary key (id);
-- One row per (topic,url) within a scope; global rows share the zero-uuid bucket.
create unique index if not exists topic_resources_scope_uq
  on public.topic_resources (retrieval_topic_id, url, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Read scope: global + own school (was USING(true)). Global rows (school_id NULL)
-- stay visible to everyone, so the seeded interactive-science set is unaffected.
drop policy if exists topic_resources_read on public.topic_resources;
create policy topic_resources_read on public.topic_resources for select to authenticated
  using (school_id is null or school_id = public.user_school_id());
grant select on public.topic_resources to authenticated;

-- Add / replace a resource link for the caller's own school (staff only).
create or replace function public.upsert_topic_resource(
  p_topic_id uuid, p_url text, p_title text, p_kind text default 'tool')
returns public.topic_resources
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_school uuid; v_row public.topic_resources;
begin
  if not public.is_staff() then raise exception 'not authorised' using errcode = '42501'; end if;
  v_school := public.user_school_id();
  if v_school is null then raise exception 'no school on your account' using errcode = '42501'; end if;
  if coalesce(btrim(p_url),'') = '' or coalesce(btrim(p_title),'') = '' then
    raise exception 'url and title are required'; end if;
  if p_kind not in ('tool','widget','booklet','pdf') then p_kind := 'tool'; end if;
  insert into public.topic_resources (retrieval_topic_id, url, kind, title, school_id, created_by, mapped_by, confidence)
  values (p_topic_id, btrim(p_url), p_kind, btrim(p_title), v_school, auth.uid(), 'school', 'manual')
  on conflict (retrieval_topic_id, url, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set title = excluded.title, kind = excluded.kind, updated_at = now()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.upsert_topic_resource(uuid,text,text,text) from public, anon;
grant execute on function public.upsert_topic_resource(uuid,text,text,text) to authenticated;

-- Remove one of the caller's OWN school resources (never a global/other-school row).
create or replace function public.delete_topic_resource(p_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'not authorised' using errcode = '42501'; end if;
  delete from public.topic_resources
    where id = p_id and created_by = auth.uid() and school_id = public.user_school_id();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.delete_topic_resource(uuid) from public, anon;
grant execute on function public.delete_topic_resource(uuid) to authenticated;
