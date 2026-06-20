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

## Enabling it — self-serve (shipped)

`supabase/migrations/20260620_school_onboarding.sql` makes setup self-serve via
`SECURITY DEFINER` RPCs — **no hand-run SQL**. The **School** nav item now shows for every
teacher; `/school` renders an onboarding panel when you're not yet in a school:

- **Create a school** → `create_school(name)` makes the school + a join code and sets you
  as `slt`.
- **Join a school** → `join_school(code)` attaches you as a `member`.
- `leave_school()` detaches; `school_members()` gives an slt/hod the roster.

There is deliberately **no client-writable path** to set your own `school_role`, so nobody
can grant themselves slt on a school they didn't create. An slt only sees aggregates of
teachers who opted in with the code, which is what makes self-serve safe. The slt sees the
join code + staff count on the dashboard. `SK_API_KEY` must be set for the retrieval
aggregation; without it the grid shows classes but no mastery.

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
