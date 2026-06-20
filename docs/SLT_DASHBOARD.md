# SLT / Department Dashboard — implementation

Strategy Build 2 (the B2B moat). A Head of Department / SLT user sees aggregated
mastery across **every class in their school**, not just their own — to target
support, not to rank teachers.

## What shipped

| Piece | File |
|---|---|
| Schema (`schools`, `profiles.school_id` + `school_role`, `school_classes()` RPC) | `supabase/migrations/20260620_schools_roles.sql` |
| Aggregation API | `src/app/api/school/overview/route.ts` |
| Dashboard | `src/app/school/page.tsx` (nav: **School**, shown only for hod/slt) |

## How cross-teacher access works (without widening RLS)

Every base table stays **owner-scoped** (`teacher_id = auth.uid()`). The single
cross-teacher read is `school_classes()` — a `SECURITY DEFINER` RPC that returns a
school's class metadata **only** when the caller's profile is `hod`/`slt` and only for
teachers in the **same** `school_id`. It exposes class metadata + `retrieval_class_ids`,
never personal pupil rows.

```
/api/school/overview  (caller's JWT)
  ├─ resolve caller → profiles.school_role  (gate: hod | slt)
  ├─ school_classes()                        ← security-definer, school-scoped
  └─ per class: class_weak_topics(retId)     ← same RPC the feedforward cron uses,
                                                called server-side with SK_API_KEY
  → compact payload: classes[] each with weak[] (per-objective aggregates only)
```

The dashboard rolls the per-class weak objectives into a **cohort leaderboard** and a
**by-class grid**, with year-group + discipline filters — all client-side from that one
payload, so filtering is instant and no per-pupil data leaves the server.

## Enabling it (pilot)

Roles are assigned **out-of-band** for now — there is deliberately no self-serve policy
to grant yourself SLT. To enable a pilot school:

```sql
-- 1. create the school
insert into public.schools (name) values ('Pilot High School') returning id;
-- 2. link staff + grant the role (slt = whole school, hod = department lead)
update public.profiles set school_id = '<school-uuid>', school_role = 'slt'
where id = '<your-auth-uid>';
-- 3. link the teachers whose classes should roll up
update public.profiles set school_id = '<school-uuid>'
where id in ('<teacher-uid>', ...);
```

Then the **School** nav item appears and `/school` populates. `SK_API_KEY` must be set
(same secret the cron uses) for the retrieval aggregation; without it the grid shows
classes but no mastery.

## Intervention export (shipped, SLT-only)

`/school/intervention` (`src/app/school/intervention/page.tsx` + `/api/school/intervention`)
lists pupils **below a mastery threshold** (40/50/65%) per objective, grouped by objective,
and exports a **CSV** for intervention groups / disadvantaged-gap tracking.

This is **pupil-level personal data**, so it is restricted to `slt` (not `hod`). It reads a
retrieval-side RPC — the per-pupil analogue of `class_weak_topics`:

```
class_intervention_list(p_class_id uuid, p_threshold int) RETURNS TABLE(
  student_id uuid, student_name text, topic_id uuid, topic_name text,
  pct_correct numeric, marked int)
```

Same `x-sciencekit-key` gating; lives in the retrieval repo. Until it ships the page loads
with an empty list + a note. **Data protection:** the school's lawful basis for intervention
applies; surface this only to senior leaders and handle exports per the school DPA / UK GDPR
(see the strategy risks section).

## Deliberately out of scope (next)

- **HOD scoping by discipline** — `hod` currently sees the whole school's science (the
  product is science-only). Split by department when multi-subject lands.
- **Self-serve school setup + invites**, MAT/multi-school benchmarking — Build 4.
- **Trend over time** — snapshots per half-term (the data exists; the view doesn't yet).
