# `@houchell/db` migrations — the unified anchor schema

**The cutover already happened.** The Phase-3 unification (see
`retrieval-app/db/unification/README.md`) collapsed the ScienceKit teacher project and
pulse-student-hub into the one anchor (`uvzukwoxqhcxaxtzrziy`). Verified live **2026-06-23**:
the anchor holds the merged schema — retrieval's own history **plus** the ported `feynman_*`
migrations **plus** the `phase3_*` reconcile rows (110 total) — and there is no leftover `feynman`
staging schema. So this package does **not** re-merge two repos by hand; it **mirrors what is already
applied on the anchor.**

## Source of truth

`LEDGER.json` is the exact, ordered list of migrations applied on the anchor (110 as of
2026-06-23). The `version` prefix (a timestamp) defines apply order, so a lexical sort of
`<version>_*.sql` filenames == apply order.

## Seeding the SQL bodies (one time)

The bodies aren't committed yet because the canonical, drift-free way to produce them is to pull
them straight from the live anchor rather than transcribe two repos:

```bash
# from a machine with the Supabase CLI + DB egress (the agent sandbox has neither)
supabase link --project-ref uvzukwoxqhcxaxtzrziy
supabase db pull                       # writes the live schema as migration(s)
# place the result here as <version>_<name>.sql matching LEDGER.json, then:
npm run check:ledger                   # every ledger version has a body; nothing extra
```

Alternatively keep the existing per-change `.sql` files from both repos and rename them to their
ledger `version` prefix; `check:ledger` will tell you exactly which versions are still missing a
body and which local files aren't in the ledger.

## After seeding

- `npm run apply`   — replays every `*.sql` in order against `DATABASE_URL` (CI uses this to build
  the ephemeral Postgres before the contract test).
- `npm run check:ledger` — fails if migrations/ diverges from `LEDGER.json` (prod).
- New schema changes: add the migration here **and**, if it adds/changes an RPC the apps call,
  update `../contracts/rpcs.mjs` in the **same PR**. The contract test enforces the pairing.

## Why this is the prize

Before: two migration sets in two repos, both hitting one DB, contracts documented but not
enforced → a renamed/removed RPC degraded to a silent fallback in production. Here there is one
ordered set and one contract, checked in CI. The 2026-06-17 rehearsal bug (two enums silently not
moved) is exactly the class of failure `check:ledger` + the contract test would have caught.
