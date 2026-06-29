# @houchell/db

The single source of truth for the unified anchor schema — and the contract test that turns
cross-repo RPC drift from a **silent production fallback** into a **red CI check**. This is the
centerpiece of Phase B in [`docs/MONOREPO_AND_DOMAIN_PLAN.md`](../../docs/MONOREPO_AND_DOMAIN_PLAN.md).

> Prepared, uncommitted. Written in `.mjs` on purpose: the app repo's `tsc` globs `**/*.ts` and
> its vitest is scoped to `src/**`, so nothing here touches the current security branch's CI. In
> the monorepo this becomes a TypeScript package with its own tsconfig.

## What's here

| File | What it is |
|---|---|
| `contracts/rpcs.mjs` | The 25 RPCs the feynman app calls, with **exact live signatures** captured from the anchor 2026-06-23. |
| `contract.test.mjs` | `node --test`: asserts every required RPC exists with the expected signature. |
| `lib/checkRpcs.mjs` | Shared check (ok / missing / mismatched) backing the test and the verify script. |
| `lib/applyMigrations.mjs` | Replays `migrations/*.sql` in ledger order (CI builds the ephemeral DB with this). |
| `lib/pg.mjs` | `DATABASE_URL` connection helper (TLS for `*.supabase.co`). |
| `scripts/verify-rpcs.mjs` | `npm run verify:live` — print the contract status against any DB; read-only. |
| `scripts/check-ledger.mjs` | `npm run check:ledger` — assert `migrations/` matches the anchor ledger. |
| `migrations/LEDGER.json` | The 110 migrations applied on the live anchor — the canonical order. |
| `migrations/README.md` | How to seed the SQL bodies (`supabase db pull`) — see it first. |

## Run it

```bash
cd packages/db
npm install                                   # just `pg`

# A) verify the LIVE anchor still honours the contract (read-only) — works today:
DATABASE_URL="postgresql://postgres:<pw>@db.uvzukwoxqhcxaxtzrziy.supabase.co:5432/postgres" \
  npm run verify:live
#   → prints ok/missing/mismatched and exits non-zero on any gap.
#   (As of 2026-06-23 all 25 are present with the expected signatures.)

# B) the CI path: build an ephemeral Postgres from migrations/, then test
#    (needs the SQL bodies seeded — see migrations/README.md)
DATABASE_URL="postgres://postgres:postgres@localhost:5432/contract" npm run apply
DATABASE_URL="postgres://postgres:postgres@localhost:5432/contract" npm test
```

The agent sandbox can't reach the Supabase DB port, so (A) is for you to run locally; the
contract was instead confirmed live this session via the read-only management API.

## CI

[`.github/workflows/db-contract.yml`](../../.github/workflows/db-contract.yml) spins a
`postgres:16` service, applies the migration set, and runs the contract test — on any change under
`packages/db/**` (path-filtered, so it stays out of the way of unrelated branches). An optional
`verify-live` job (manual trigger, gated on an `ANCHOR_DATABASE_URL` secret) runs the same check
against the live anchor.

## Status snapshot (verified 2026-06-23)

- Cutover **done**: anchor `uvzukwoxqhcxaxtzrziy` holds the unified schema; ScienceKit
  (`uujbgdwnuspfnvfpdtvr`, auth_users=1, no `responses`) and pulse-hub survive as read-only
  rollback, pending Phase-6 decommission.
- All 25 contract RPCs present with expected signatures.
- Remaining gate before the monorepo move: Phase 5 (`security/sk-api-key-rotation-phase5`) —
  re-gate the weak-topic RPCs by role and drop `SK_API_KEY` on interactive paths.
