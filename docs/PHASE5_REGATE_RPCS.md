# Phase 5 — re-gate the weak-topic RPCs by role, drop the shared secret

**Goal:** replace the `x-sciencekit-key` shared-secret gate on the teacher-facing
retrieval RPCs with a **teacher-JWT + role/school_id (or class ownership)** check inside
the `SECURITY DEFINER` functions — keeping the secret **only** for the service-role /
cron path. This finishes the Phase 3 unification (one anchor DB, RLS-gated) and retires
the cross-app shared secret as an authorization mechanism for interactive traffic.

This supersedes the stop-gap rotation in [`SECRET_ROTATION_SK_API_KEY.md`](./SECRET_ROTATION_SK_API_KEY.md):
rotation keeps the secret alive; Phase 5 removes the need for it on every path except cron.

> **Cross-repo.** The RPC definitions live in the **retrieval repo / anchor Supabase
> project** (`uvzukwoxqhcxaxtzrziy`), not here. This repo only changes the *callers*
> (drop the secret arg). Coordinate the DB migration and the app deploy together.

## The pattern already exists

`trust_objective_mastery` and `school_objective_mastery` are already called **with the
teacher JWT and no secret** (`src/app/api/{trust,school}/overview/route.ts`). They self-gate
on the caller's role inside the function. Phase 5 makes the weak-topic RPCs follow that
same model. Use those two functions as the reference implementation.

## RPCs in scope

`student_weak_topics`, `class_weak_topics`, `class_unit_gaps`, `class_paper_gaps`,
`class_objective_breakdown`, `class_intervention_list`. (`class_intervention_list` is
per-pupil / personal data — gate it the strictest: `slt` of the owning school only.)

## Caller inventory — what changes

| Route | Caller identity today | RPCs | Phase 5 |
| --- | --- | --- | --- |
| `api/teacher/overview` | teacher JWT + secret | `class_weak_topics` | **drop secret**; RPC allows class **owner** (`classes.teacher_id = auth.uid()`) |
| `api/school/overview` | hod/slt JWT + secret | `class_weak_topics` | **drop secret**; RPC allows hod/slt of the class's `school_id` |
| `api/school/intervention` | slt JWT + secret | `class_intervention_list` | **drop secret**; RPC allows **slt** of the class's `school_id` (personal data) |
| `api/trust/overview` | trust_lead JWT + secret | `class_weak_topics` | **drop secret**; RPC allows trust_lead of the trust owning the class's school |
| `lib/sk.tsx` `ret.*` (client) | teacher JWT, **no secret already** | `class_unit_gaps`, `class_paper_gaps`, `class_weak_topics`, `class_objective_breakdown` | RPC must accept the teacher JWT directly (today these only work because of a separate path / will 403 until re-gated) |
| `api/parent/portal` | **service-role** + secret | `student_weak_topics`, `class_weak_topics` | **keep secret** (no teacher identity — magic-link) |
| `api/parent-report/preview`, `lib/parentReport.ts` | service-role + secret | `student_weak_topics`, `class_weak_topics` | **keep secret** |
| `api/cron/weekly-parent-report` | service-role + secret | weak topics | **keep secret** (cron) |
| `api/cron/{school,trust}-snapshots` | service-role + secret | `class_weak_topics` | **keep secret** (cron) |
| `api/cron/halfterm-feedforward` | anon + secret (CRON_SECRET-gated) | weak topics | **keep secret** (cron; no teacher identity) |

## DB change (retrieval repo) — per RPC

Re-gate each in-scope `SECURITY DEFINER` function to authorize like:

```sql
-- pseudo-guard inside each function
if auth.role() = 'service_role' then
  -- cron / server path: still gated by the x-sciencekit-key the caller must present,
  -- OR simply trust service_role. Keep the secret check here ONLY.
  null;  -- allow
else
  -- interactive teacher path: require an authenticated caller with the right role
  -- and scope. Exact predicate depends on the RPC:
  --   class_weak_topics(p_class_id): caller owns the class, OR is hod/slt of its
  --     school, OR trust_lead of its trust.
  --   class_intervention_list(p_class_id): caller is slt of the class's school.
  -- Reject (raise / return empty) otherwise.
  if not <role+scope check on auth.uid()> then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end if;
```

Reuse the helper predicates that `school_objective_mastery` / `trust_objective_mastery`
already use for the school/trust role checks, and the `classes.teacher_id`/`school_id`
joins for ownership.

## Rollout sequence (no outage)

1. **DB, additive:** re-gate the RPCs to accept **either** (a) a valid teacher JWT with
   the right role/scope **or** (b) the existing secret. Both paths work → nothing breaks.
2. **App (this repo):** drop the `secret` argument from the four teacher-JWT routes above
   (`teacher/overview`, `school/overview`, `school/intervention`, `trust/overview`) so
   interactive calls authorize purely on the JWT. Leave the cron/service-role routes and
   `parent/*` untouched (they keep sending the secret).
3. **Verify** all dashboards + the parent portal + crons (checklist below).
4. **DB, subtractive:** remove the secret-acceptance branch from the **interactive** RPCs,
   leaving the secret valid **only** where `auth.role() = 'service_role'` (cron). The
   shared secret is now unusable for interactive reads.
5. The secret survives solely for the cron/service path. (A later phase could move cron to
   pure service-role and retire the secret entirely.)

## Tracking checklist

**Retrieval repo (DB):**
- [ ] `class_weak_topics` re-gated (owner / hod / slt / trust_lead by scope), dual-accept
- [ ] `student_weak_topics` re-gated
- [ ] `class_unit_gaps` re-gated
- [ ] `class_paper_gaps` re-gated
- [ ] `class_objective_breakdown` re-gated
- [ ] `class_intervention_list` re-gated (slt-only, personal data)
- [ ] migration reviewed against `school_objective_mastery` reference impl
- [ ] secret-accept branch removed from interactive RPCs (step 4), kept for `service_role`

**feynman-education (this repo):**
- [ ] `api/teacher/overview` — drop `secret` from the `class_weak_topics` call
- [ ] `api/school/overview` — drop `secret` (both `rpc` and `rpcT`)
- [ ] `api/school/intervention` — drop `secret` from `class_intervention_list`
- [ ] `api/trust/overview` — drop `secret` from `class_weak_topics`
- [ ] confirm `lib/sk.tsx` `ret.*` client RPCs resolve under the teacher JWT post-re-gate
- [ ] cron + `parent/*` routes left **unchanged** (still send the secret)
- [ ] update the `// Env: SK_API_KEY` header comments on the re-gated routes

## Acceptance criteria

- No interactive (teacher/hod/slt/trust_lead) read path sends `x-sciencekit-key`.
- A direct RPC call presenting only the secret (no teacher JWT) returns **empty/forbidden**
  for the interactive RPCs, but still works from the service-role cron path.
- Dashboards, intervention list, and parent portal render identical data to pre-Phase-5.
- An authenticated teacher cannot read another teacher's class via these RPCs (scope check).

## Related

- [`PHASE3_REPOINT.md`](./PHASE3_REPOINT.md) — items 2 & 3 of "Must land WITH this deploy"
  are this work.
- [`COMPLETION_AND_EXPANSION_ROADMAP.md`](./COMPLETION_AND_EXPANSION_ROADMAP.md) and
  [`NOW_BUILD_PLAN.md`](./NOW_BUILD_PLAN.md) (T1.1) reference "drop the `x-sciencekit-key`
  path" — that is this doc.
