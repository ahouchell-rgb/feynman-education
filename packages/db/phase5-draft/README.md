# phase5-draft/ — re-gate the interactive RPCs by role, drop the shared secret

> **STATUS 2026-06-28:** `01` + `02` (the **additive** half) are **APPLIED to the live anchor**
> (`uvzukwoxqhcxaxtzrziy`) as migrations `phase5_01_gate_helpers` + `phase5_02_additive_rpcs` —
> dry-run-validated in a rolled-back transaction first, then verified live (3 helpers present, all 6
> RPCs wired, secret branch preserved, security advisors: 0 new errors). **Still to do:** the app PR
> dropping `x-sciencekit-key` on the 4 routes, verify with a real `slt`/`trust_lead` profile, then
> apply `03` (subtractive) + rotate `app_config.sciencekit_key`.

Implements `docs/PHASE5_DESIGN.md`, grounded in the live schema (`../live-defs/ROLE_MODEL.md`).
Reviewed against all 6 RPC bodies captured from the anchor.

| File | What | When to apply |
|---|---|---|
| `01_gate_helpers.sql` | `can_read_class_analytics` / `can_read_class_pii` / `can_read_student_analytics` — superset of today's access + school(hod/slt) + trust_lead scope | Step 1a |
| `02_additive_rewrite_rpcs.sql` | the 6 RPCs re-gated to `( secret OR helper )` — **no breakage, no one loses access** | Step 1b |
| `04_assign_leadership_roles.sql` | **TEMPLATE** — set `school_role`/`trust_role` for the real leaders (the unblock; all profiles are `'member'` today) | Step 3a (data) |
| `05_verify_coverage.sql` | **TEMPLATE** — simulate a leader's JWT, confirm the gate passes for them (read-only, rolled back) | after 04 |
| `03_subtractive_drop_secret.sql` | the 5 secret-bearing RPCs re-gated to just `helper` (secret removed) + rotate note | Step 4 (last) |

## Safe order
1. Apply `01` then `02` (additive — adds identity scope, keeps the secret). Dashboards keep working.
2. App PR drops the `x-sciencekit-key` header on: `teacher/overview`, `school/overview`,
   `school/intervention`, `trust/overview` (branch `security/sk-api-key-rotation-phase5`).
3. **Verify** with a real `slt` and `trust_lead` profile that the dashboards load with no secret;
   `npm run verify:live` still 25/25.
4. Apply `03` (drop the secret branch), then rotate `private.app_config.sciencekit_key`.

## Decisions baked in
- PII scope (`class_intervention_list`): **Teacher + HoD/SLT + trust** (chosen 2026-06-28). `can_read_class_pii`
  is a separate function (currently == analytics) so it can be tightened later without touching the others.
- Helpers keep the legacy `profiles.hod_id` pointer **and** add `school_role`, so the additive step is a
  pure superset (no regression). A later cleanup can drop the pointer once `school_role` is confirmed populated.

## Not validated against a live/ephemeral DB yet
These were authored from the captured function bodies (read-only). Before applying, dry-run on a Supabase
**branch** (or apply `01`+`02` to prod — they're additive/reversible) and smoke-test the dashboards.
