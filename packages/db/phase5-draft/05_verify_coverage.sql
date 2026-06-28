-- PHASE 5 — verify a leader has identity coverage (run AFTER 04, BEFORE dropping their secret).
-- Read-only: simulates the leader's JWT and checks the gate passes on a class in their scope,
-- then ROLLBACKs. Replace every REPLACE.email below with the same real email. Expect all `true`.
-- (This is the same technique used to verify teacher/overview: set request.jwt.claims -> call the gate.)

begin;
create temp table _v(check_name text, result boolean) on commit drop;

-- Act as the leader.
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where email = 'REPLACE.email'))::text, true);

-- A class in the leader's own school (school leaders) — analytics + PII gates should both pass.
insert into _v
select 'analytics_on_school_class', public.can_read_class_analytics(c.id)
from public.classes c
join public.profiles me on me.id = (select id from public.profiles where email = 'REPLACE.email')
where c.school_id = me.school_id and c.archived = false
limit 1;

insert into _v
select 'pii_on_school_class', public.can_read_class_pii(c.id)
from public.classes c
join public.profiles me on me.id = (select id from public.profiles where email = 'REPLACE.email')
where c.school_id = me.school_id and c.archived = false
limit 1;

-- For a TRUST lead, also check a class in another school of the same trust:
insert into _v
select 'analytics_on_trust_class', public.can_read_class_analytics(c.id)
from public.classes c
join public.schools s on s.id = c.school_id
join public.profiles me on me.id = (select id from public.profiles where email = 'REPLACE.email')
where s.trust_id = me.trust_id and c.archived = false
limit 1;

select * from _v order by check_name;   -- expect result = true for the rows relevant to this leader
rollback;
