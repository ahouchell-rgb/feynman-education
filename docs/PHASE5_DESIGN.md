# Phase 5 — concrete design (grounded in the live anchor)

Implements `PHASE5_REGATE_RPCS.md` (the runbook), now grounded in the real schema captured in
`packages/db/live-defs/ROLE_MODEL.md`. **Status: DRAFT. Nothing applied to production.**

## Key finding that de-risks this
The SLT/trust model the runbook treated as missing **already exists and works**: `profiles.school_role`
(`hod`/`slt`), `profiles.trust_role` (`trust_lead`) + `trust_id`, `classes.school_id`, `schools.trust_id`.
The dashboard RPCs (`school_objective_mastery`, `trust_classes`, …) already gate on it. The six
interactive weak-topic RPCs simply **don't use it yet** — they fall back to the shared secret for any
caller who isn't the class teacher. So Phase 5 = port the proven pattern onto those six RPCs and drop
the secret. The gate helpers are drafted in `packages/db/phase5-draft/01_gate_helpers.sql`.

## The decision needed (one)
`class_intervention_list` returns pupil names (PII). The runbook says **slt-only**. The draft helper
`can_read_class_pii` instead allows **moderator + class's own teacher + school hod/slt + trust_lead**
(HoDs and the class's own teacher legitimately run interventions). Pick the line:
- **A — recommended:** as drafted (moderator + own teacher + hod/slt + trust_lead).
- **B — strict runbook:** slt + trust_lead + moderator only (HoDs and teachers lose the PII list).
- **C — minimal:** keep today's behaviour for PII, only re-gate the 5 non-PII analytics RPCs.

## Rollout (safe order — no window where dashboards break)
1. **DB additive** — `apply_migration`: create the two helpers, then `CREATE OR REPLACE` each of the
   6 RPCs so its gate becomes `( <existing secret branch> OR public.can_read_class_analytics(p_class_id) )`
   (`can_read_class_pii` for `class_intervention_list`). Secret still works → **zero breakage**; school/
   trust dashboards now also pass via identity.
2. **App** — drop the `secret` arg from the calls (branch `security/sk-api-key-rotation-phase5`):
   - `feynman-education/src/app/api/teacher/overview/route.ts` (`class_weak_topics`)
   - `…/api/school/overview/route.ts` (`class_weak_topics`)
   - `…/api/school/intervention/route.ts` (`class_intervention_list`)
   - `…/api/trust/overview/route.ts` (`class_weak_topics`)
   - update the `// Env: SK_API_KEY` header comments. **Leave cron/parent paths secret-gated.**
3. **Verify** — school/trust/teacher dashboards load with a real JWT and no secret (test with an
   `slt` and a `trust_lead` profile). `npm run verify:live` still 25/25.
4. **DB subtractive** — `CREATE OR REPLACE` the 6 RPCs to drop the secret branch (gate = just the helper),
   then rotate `private.app_config.sciencekit_key`. Confirm cron still works (it uses its own secret-gated
   RPCs, not these six).

## Per-RPC change (mechanical)
Each of the 6 RPCs keeps its body; only the gate clause changes. Worked examples for the two whose full
bodies are captured (`class_weak_topics`, `class_intervention_list`) are in ROLE_MODEL.md; the other four
(`student_weak_topics`, `class_unit_gaps`, `class_paper_gaps`, `class_objective_breakdown`) are the same
pull-and-swap — pull each via `dump-functions.mjs`, replace the `( secret OR is_moderator() OR teacher OR
hod_id )` clause with the helper call.

## Standardisation note
The current class gate's HoD check uses `profiles.hod_id` (teacher→hod pointer); the helpers use
`school_role in ('hod','slt')` + `school_id` match (matches the dashboards). Standardising on the
helper is intended — but confirm no workflow relies on the `hod_id` pointer for a HoD who isn't
flagged `school_role='hod'`.

## What I will NOT do without explicit sign-off
Run `apply_migration` (steps 1 & 4) or rotate `app_config.sciencekit_key` against the live anchor.
Those are the hard-to-reverse, pupil-data-facing actions. Once you pick the PII line and approve, I can
apply step 1 (additive — safe, reversible) and prepare the app-side PR.
