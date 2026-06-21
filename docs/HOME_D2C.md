# Home / D2C (NOW plan E8)

The consumer layer on the existing **password-less parent token-portal** — no parent
accounts or live Stripe required, so it ships now; the parent-paid checkout slots in once
parent accounts (E4) land.

## What shipped

| Piece | File |
|---|---|
| Schema (`schools.home_sponsored`, `guardian_student.home_subscribed` + `target_grade`, `set_school_home_sponsored` RPC) | `supabase/migrations/20260621_home_d2c.sql` |
| Portal Home data (weak objectives, sponsorship, target) | `src/app/api/parent/portal/route.ts` |
| Parent sets target (token-validated) | `src/app/api/parent/set-target/route.ts` |
| Home UI on the portal | `src/app/parent/page.tsx` |
| School-sponsor toggle (SLT) | `src/app/school/page.tsx` + `/api/school/overview` |

## How it works

- **Unlock:** a child's Home is enabled when their **school sponsors it** (an SLT toggles
  `home_sponsored` via the gated RPC) **or** the guardian has `home_subscribed` (the
  parent-paid funnel, wired later through the existing `parent_home` billing plan).
- **Adaptive practice:** the portal route pulls the child's **weakest objectives**
  (`student_weak_topics`, falling back to `class_weak_topics`) and renders them with
  per-objective "Practise →" deep links into retrieval-app — the adaptive pathway v1.
- **Target tracker:** the parent sets a target grade (written via the token-validated
  `set-target` route — the access token must own the link), shown against a recent-practice
  score.

## Both funnels

- **School-sponsored (live):** SLT → "Sponsor Home" → free for all that school's parents.
- **Parent-paid (scaffolded):** the `parent_home` plan + `home_subscribed` flag are in
  place; the consumer checkout needs **parent accounts** (E4) + live Stripe to complete.

## Next

- Parent accounts → self-serve parent-paid checkout (Stripe `parent_home` price).
- Pupil-direct login (vs parent-mediated) and spaced-repetition scheduling.
- Surface target vs trajectory once per-pupil attainment/QLA flows in.
