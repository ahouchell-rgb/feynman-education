-- PHASE 5 — STEP 3a (DATA), TEMPLATE. NOT APPLIED. Fill in real people, review, apply when ready.
--
-- This is the unblock: the Phase 5 identity gates check profiles.school_role in ('hod','slt')
-- and profiles.trust_role = 'trust_lead', but today EVERY profile has these set to 'member'
-- (0 leaders). Until the real leaders are assigned, the school/trust/intervention dashboards
-- must keep the x-sciencekit-key secret. Deciding WHO is SLT / HoD-with-school-view / trust-lead
-- is a product/data call — that's why this is a template, not an applied migration.
--
-- Safe to run as a normal SQL block (data-only UPDATEs). Wrap in a transaction, check the
-- affected-row counts, then commit. Re-run is idempotent.

begin;

-- 1) SCHOOL LEADERS — give school-wide view of their school's classes.
--    'slt' = leadership (also the only role that may see the PII intervention list if you later
--    tighten can_read_class_pii to slt-only); 'hod' = head of dept with school-wide view.
--    They must already belong to the school (school_id set via join_school).
update public.profiles set school_role = 'slt'
 where email = 'REPLACE.slt@school.uk'  and school_id is not null;   -- expect 1 row
update public.profiles set school_role = 'hod'
 where email = 'REPLACE.hod@school.uk'  and school_id is not null;   -- expect 1 row
-- ...add one line per leader...

-- 2) TRUST LEADS — give trust-wide view. Sets trust_role and backfills trust_id from the
--    leader's school's trust if not already set (schools.trust_id links school -> trust).
update public.profiles p set trust_role = 'trust_lead',
       trust_id = coalesce(p.trust_id, (select s.trust_id from public.schools s where s.id = p.school_id))
 where p.email = 'REPLACE.lead@trust.org';                          -- expect 1 row

-- 3) VERIFY before commit — every named leader has the right role + a non-null scope id.
select email, role, school_role, school_id, trust_role, trust_id
from public.profiles
where email in ('REPLACE.slt@school.uk','REPLACE.hod@school.uk','REPLACE.lead@trust.org')
order by email;

-- If the rows look right (school leaders: school_role hod/slt + school_id; trust leads:
-- trust_role trust_lead + trust_id), COMMIT. Otherwise ROLLBACK and fix the emails.
rollback;   -- <- change to `commit;` once verified
