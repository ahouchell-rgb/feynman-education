# Rotating `SK_API_KEY` (the `x-sciencekit-key` shared secret)

**Status:** runbook — the code side (Task 1) is done; the secret value below must be
rotated by a human with prod access. Every step marked **🔒 PROD** changes live state
and must not be run without explicit go‑ahead.

## Why

The `x-sciencekit-key` shared secret was hardcoded in `src/lib/sk.tsx` — a `"use client"`
module — so it shipped in the client JS bundle and is also present in git history
(commit `7c4564a` and earlier; the literal was removed in `b7fdaa6`). Removing it from
source does **not** un‑expose it: anyone who pulled a bundle or the history already has it.
**Rotation is the actual mitigation.** Until it's rotated, treat the old value as public.

The secret gates three+ retrieval‑owned RPCs (`student_weak_topics`, `class_weak_topics`,
`class_unit_gaps`, and the related `class_paper_gaps` / `class_objective_breakdown` /
`class_intervention_list`). With the live value, anyone can call those RPCs directly
against the retrieval Supabase project and read per‑class / per‑pupil aggregates.

## The two ends that must agree

The gate is a single shared secret compared in two places:

| End | Where it lives | What to change |
| --- | --- | --- |
| **Retrieval app (Supabase)** | `private.app_config` setting that the gating RPCs read (e.g. `current_setting` / a `private.app_config` row keyed on the secret). Confirm the exact key name in the **retrieval repo**. | Store the new secret value. |
| **feynman‑education (Vercel)** | env var `SK_API_KEY`, sent as the `x-sciencekit-key` header by the server routes + crons. | Set the new value (Production + Preview), redeploy. |
| **Local dev** | `.env.local` (gitignored) — currently has **no** `SK_API_KEY` line. | Add the new value if you run the retrieval‑backed routes locally. |

> The old value must keep working until Vercel is flipped, or live dashboards/crons
> 500. Prefer the **dual‑accept** sequence below for zero downtime.

## Generate the new secret

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='   # 43‑char URL-safe (header-safe)
# or, alphanumeric-only:
openssl rand -hex 32
```

Keep it out of the repo. Do **not** paste it into any committed file (this runbook included).

## Rotation — dual‑accept (zero downtime, recommended)

Use this if the retrieval gate can be made to accept two values at once.

1. **🔒 PROD — Retrieval (Supabase):** make the gating check accept **both** the old and
   the new secret. Either store a second key (`x-sciencekit-key-next`) or have the RPC's
   `SECURITY DEFINER` guard compare the header against a *set* of allowed values in
   `private.app_config`. Deploy/migrate. *(No client impact — old value still valid.)*
2. **🔒 PROD — Vercel (feynman‑education):** set `SK_API_KEY` = **new** value for
   Production (and Preview). Redeploy so all server routes + crons pick it up.
3. **Verify** (see checklist) that every consumer works on the new value.
4. **🔒 PROD — Retrieval (Supabase):** remove the **old** value from `private.app_config`
   so only the new secret is accepted. The old (exposed) value is now dead.
5. Update `.env.local` locally; notify anyone else with a working copy.

## Rotation — atomic swap (simpler, brief window)

Use only if dual‑accept isn't feasible. There is a short window where in‑flight requests
on the old value fail; schedule it off‑peak (crons: `weekly-parent-report`,
`*-snapshots`, `halfterm-feedforward` — avoid their scheduled times — see `vercel.json`).

1. **🔒 PROD — Vercel:** set `SK_API_KEY` = new value (don't redeploy yet, or set then
   immediately do step 2).
2. **🔒 PROD — Retrieval (Supabase):** update `private.app_config` to the new value.
3. Redeploy feynman‑education; verify.

## Verify (after the flip)

Run against production with a valid teacher session token where noted:

- [ ] `GET /api/teacher/overview` (teacher JWT) → weak topics populate, no 500.
- [ ] `GET /api/school/overview?live=1` (hod/slt JWT) → per‑class weak topics populate.
- [ ] `GET /api/school/intervention` (slt JWT) → intervention rows populate.
- [ ] `GET /api/trust/overview?live=1` (trust_lead JWT) → schools roll up.
- [ ] `GET /api/parent/portal?t=<token>` → child weak topics render.
- [ ] Trigger a cron manually (e.g. `/api/cron/trust-snapshots?force=1` with `CRON_SECRET`)
      → returns `snapshotted > 0`, no `SK_API_KEY missing`.
- [ ] Old value rejected: a direct RPC call with the **old** `x-sciencekit-key` returns
      empty/forbidden.

## Notes

- Git history still contains the old literal. Rotation makes that harmless. A history
  rewrite (`git filter-repo` / BFG) is optional and disruptive (forces re‑clones, breaks
  open PRs) — not required once the value is dead, and out of scope here.
- This is a stop‑gap. **Phase 5** removes the shared‑secret gate from the teacher‑facing
  RPCs entirely (replacing it with a teacher‑JWT + role/school_id check), keeping the
  secret only on the service‑role cron path. See [`PHASE5_REGATE_RPCS.md`](./PHASE5_REGATE_RPCS.md).
