-- Phase 3 verification — run on the branch after 10_reconcile.sql. Read-only.
-- Eyeball each section; anything unexpected means iterate on the reconcile before cutover.

\echo '== row counts (expect: responses 2955, profiles 22, units 47, resource_map 60) =='
select 'responses'   as t, count(*) from public.responses
union all select 'profiles',  count(*) from public.profiles
union all select 'classes',   count(*) from public.classes
union all select 'units',     count(*) from public.units
union all select 'lessons',   count(*) from public.lessons
union all select 'resource_map', count(*) from public.resource_map
union all select 'class_progress', count(*) from public.class_progress
union all select 'class_timetable_slots', count(*) from public.class_timetable_slots;

\echo '== identity: your merged profile (expect role=moderator, full_name populated) =='
select id, role, full_name, subscription_status, is_lead
from public.profiles where id = 'cef87533-7ff1-4f93-bfcf-22feb66f896a';

\echo '== imported teacher classes (expect 6 active 7H..9J owned by you, valid key_stage/tier) =='
select name, key_stage, tier, year_group, archived, current_unit_id
from public.classes
where teacher_id = 'cef87533-7ff1-4f93-bfcf-22feb66f896a' and academic_year is not null
order by archived, name;

\echo '== FK integrity (every count MUST be 0) =='
select 'class_progress→classes' as fk, count(*) from public.class_progress cp
  where not exists (select 1 from public.classes c where c.id=cp.class_id)
union all
select 'slots→classes', count(*) from public.class_timetable_slots s
  where not exists (select 1 from public.classes c where c.id=s.class_id)
union all
select 'classes.current_unit→units', count(*) from public.classes c
  where c.current_unit_id is not null and not exists (select 1 from public.units u where u.id=c.current_unit_id)
union all
select 'teacher-owned rows orphaned (decks.owner)', count(*) from public.decks d
  where d.owner is not null and not exists (select 1 from auth.users u where u.id=d.owner);

\echo '== topic_map.unit_id drift vs units (NOT-VALID FK; >0 = legacy ids to de-drift in Phase 6) =='
select count(*) as topic_map_orphans
from public.topic_map tm
where tm.unit_id is not null and not exists (select 1 from public.units u where u.id=tm.unit_id);

\echo '== leftover feynman objects (expect only helper funcs e.g. tg_set_updated_at; NO tables) =='
select 'tables' as kind, tablename as name from pg_tables where schemaname='feynman'
union all
select 'functions', proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='feynman';

\echo '== over-qualification leak check: any public function body referencing feynman.* (expect 0 rows) =='
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and pg_get_functiondef(p.oid) ilike '%feynman.%';

\echo '== over-qualification leak check: any public RLS policy referencing feynman.* (expect 0 rows) =='
select tablename, policyname from pg_policies
where schemaname='public' and (coalesce(qual,'') ilike '%feynman.%' or coalesce(with_check,'') ilike '%feynman.%');

\echo '== RLS still enabled on the imported teacher tables (expect rowsecurity=t for all) =='
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('units','lessons','decks','class_progress','class_timetable_slots',
                    'timetable_calendar','taught_log','lesson_widgets','lesson_chat_messages',
                    'microsoft_tokens','feedforward_sheets','feedforward_decks','resource_map')
order by tablename;

\echo '== get_teaching_week present in public (PostgREST RPC) =='
select proname, pronamespace::regnamespace as schema
from pg_proc where proname='get_teaching_week';
