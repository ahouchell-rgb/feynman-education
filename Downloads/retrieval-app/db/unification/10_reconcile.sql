-- Phase 3 reconciliation — run AFTER the teacher schema+data is loaded into the
-- staging schema `feynman` (see README step 1; that step also remaps your teacher
-- identity ab56a97d → cef87533 in the dump, so all teacher_id/owner FKs → auth.users
-- already resolve to your anchor user).
--
-- Idempotent where practical. Run inside a transaction with ON_ERROR_STOP=1.
-- Rehearse on a branch first. PENDING — not applied to any live DB.

begin;

-- 1. Move the teacher enum types into public (the anchor has none of these).
do $$
declare ty text;
begin
  foreach ty in array array['discipline','key_stage','term','paper'] loop
    if exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
               where n.nspname='feynman' and t.typname=ty)
       and not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
               where n.nspname='public' and t.typname=ty) then
      execute format('alter type feynman.%I set schema public', ty);
    end if;
  end loop;
end $$;

-- 2. profiles — add the teacher superset columns, then merge the teacher profile
--    into the matching anchor profile by email (your two accounts share an email;
--    the dump remap already aligned the ids too). 'admin' has no anchor role; we
--    keep the anchor role (moderator). Assert no teacher profile is left unmatched.
alter table public.profiles
  add column if not exists full_name             text,
  add column if not exists stripe_customer_id    text,
  add column if not exists subscription_status   text,
  add column if not exists subscription_id       text,
  add column if not exists subscription_end_date timestamptz,
  add column if not exists is_lead               boolean not null default false;

update public.profiles p set
  full_name             = coalesce(p.full_name, f.full_name),
  stripe_customer_id    = coalesce(p.stripe_customer_id, f.stripe_customer_id),
  subscription_status   = coalesce(p.subscription_status, f.subscription_status),
  subscription_id       = coalesce(p.subscription_id, f.subscription_id),
  subscription_end_date = coalesce(p.subscription_end_date, f.subscription_end_date),
  is_lead               = p.is_lead or coalesce(f.is_lead, false)
from feynman.profiles f
where lower(p.email) = lower(f.email);

do $$ declare n int; begin
  select count(*) into n from feynman.profiles f
   where not exists (select 1 from public.profiles p where lower(p.email)=lower(f.email));
  if n <> 0 then raise exception 'Phase3: % teacher profile(s) had no anchor match — create them in the anchor auth pool first', n; end if;
end $$;

-- 3. classes — add the teacher superset columns, then import teacher class rows
--    honouring anchor constraints (key_stage upper-cased; KS3⇒tier NULL,
--    KS4⇒tier 'Higher'; school/subject defaulted to yours/Science; join_code
--    generated; teacher_id already remapped to cef87533). IDs preserved → no
--    response/membership remap. current_unit_id gets its FK in step 5 (after units move).
alter table public.classes
  add column if not exists discipline    public.discipline,
  add column if not exists pathway       text,
  add column if not exists academic_year text,
  add column if not exists current_unit_id text,
  add column if not exists archived      boolean not null default false,
  add column if not exists archived_at   timestamptz;

insert into public.classes
  (id, name, school_id, teacher_id, subject_id, year_group, created_at, join_code,
   weekly_target, key_stage, tier, discipline, pathway, academic_year, current_unit_id, archived, archived_at)
select
  c.id, c.name,
  (select school_id from public.profiles where id = c.teacher_id),         -- your school
  c.teacher_id,                                                            -- cef87533 (remapped)
  '10c54ef6-d3ca-439b-9d54-76597ee15e1c',                                  -- anchor 'Science' subject
  c.year_group, c.created_at,
  'F' || upper(substr(md5(c.id::text), 1, 5)),                            -- generated unique join code
  10,
  upper(c.key_stage::text),                                                -- ks3→KS3, ks4→KS4
  case when upper(c.key_stage::text) = 'KS4' then 'Higher' else null end,  -- satisfies composite check
  c.discipline, c.pathway, c.academic_year, c.current_unit_id, c.archived, c.archived_at
from feynman.classes c
on conflict (id) do nothing;

-- 4. Move every remaining teacher table (keeps data, indexes, RLS, triggers intact)
--    into public — all except the two we reconciled by hand (classes, profiles).
do $$ declare r record; begin
  for r in select tablename from pg_tables
           where schemaname='feynman' and tablename not in ('classes','profiles') loop
    execute format('alter table feynman.%I set schema public', r.tablename);
  end loop;
end $$;

-- 5. Repoint the class-dependent FKs from feynman.classes onto public.classes,
--    and give public.classes.current_unit_id its FK now that units are in public.
alter table public.class_timetable_slots drop constraint if exists class_timetable_slots_class_id_fkey;
alter table public.class_timetable_slots add  constraint class_timetable_slots_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete cascade;

alter table public.class_progress drop constraint if exists class_progress_class_id_fkey;
alter table public.class_progress add  constraint class_progress_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete cascade;

alter table public.classes drop constraint if exists classes_current_unit_id_fkey;
alter table public.classes add  constraint classes_current_unit_id_fkey
  foreign key (current_unit_id) references public.units(id) on delete set null;

-- 5b. Recreate the two RLS policies whose bodies *named* the classes table — the
--     dump's public.→feynman. rewrite baked in `feynman.classes`, which we drop in
--     step 8. (Teacher functions are unqualified + SET search_path=public, so they
--     resolve correctly once moved; only these qualified policies need rebuilding.)
drop policy if exists slots_owner_all on public.class_timetable_slots;
create policy slots_owner_all on public.class_timetable_slots for all to authenticated
  using      (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

drop policy if exists progress_owner_all on public.class_progress;
create policy progress_owner_all on public.class_progress for all to authenticated
  using      (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

-- 6. Turn the existing cross-app crosswalks into real FKs.
--    topic_map.unit_id has legacy unit-id drift vs the teacher catalog, so add it
--    NOT VALID (enforces new rows, tolerates legacy; Phase 6 validates after de-drift).
alter table public.topic_map drop constraint if exists topic_map_unit_id_fkey;
alter table public.topic_map add  constraint topic_map_unit_id_fkey
  foreign key (unit_id) references public.units(id) not valid;

alter table public.lesson_retrieval_map drop constraint if exists lesson_retrieval_map_retrieval_topic_id_fkey;
alter table public.lesson_retrieval_map add  constraint lesson_retrieval_map_retrieval_topic_id_fkey
  foreign key (retrieval_topic_id) references public.topics(id) on delete cascade;

-- 7. Expose the teacher homepage RPC under public (PostgREST serves the public schema).
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='feynman' and p.proname='get_teaching_week')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='get_teaching_week') then
    execute 'alter function feynman.get_teaching_week(date) set schema public';
    execute 'grant execute on function public.get_teaching_week(date) to authenticated';
  end if;
end $$;
-- NOTE: any OTHER feynman.* function the teacher app calls via PostgREST RPC must
-- likewise be moved to public. tg_set_updated_at (trigger fn) may stay in feynman —
-- moved tables' triggers reference it by oid and keep firing.

-- 8. Drop the two staging tables we reconciled by hand. Leave the (now near-empty)
--    feynman schema in place for any retained helper functions; Phase 6 tidies it.
drop table if exists feynman.classes;
drop table if exists feynman.profiles;

-- 9. Assertions — fail loudly if anything important moved or broke.
do $$ declare v int; begin
  select count(*) into v from public.responses;            if v < 2955 then raise exception 'responses dropped: %', v; end if;
  select count(*) into v from public.units;                if v < 47   then raise exception 'units missing: %', v; end if;
  select count(*) into v from public.class_progress cp
    where not exists (select 1 from public.classes c where c.id=cp.class_id);
  if v <> 0 then raise exception 'orphan class_progress rows: %', v; end if;
  select count(*) into v from public.class_timetable_slots s
    where not exists (select 1 from public.classes c where c.id=s.class_id);
  if v <> 0 then raise exception 'orphan timetable slots: %', v; end if;
end $$;

commit;
