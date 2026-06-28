# Schema reconciliation — pull the out-of-band anchor schema into source

**This is the keystone.** Two independent reviews (the Phase 5 assessment and the monorepo
rehearsal) converged on the same blocker: the live anchor (`uvzukwoxqhcxaxtzrziy`) contains
functions — the auth/role helpers (`is_moderator`, `is_hod`, the school/trust scopes) and the
reconcile rows — that were applied **directly to the DB, out-of-band, and never committed**. So:

- **Phase 5 is blocked** — you can't write or review the new `slt`/`trust_lead` scope predicates
  without seeing the existing helpers they build on.
- **`packages/db` is half-built** — `LEDGER.json` lists the 110 applied migrations but the SQL
  bodies aren't committed, so the contract test can't run for real and `@feynman/db` is an orphan.

Reconciling the live schema back into tracked source unblocks **all three** at once.

> Everything here is **read-only against production**. The only writes are local files. Never apply
> anything from this process back to the anchor.

## Definition of done
1. Every contract RPC + every auth/role helper exists as **reviewable SQL** in the repo.
2. `npm run check:ledger` is clean (every `LEDGER.json` version has a body; nothing extra).
3. `DATABASE_URL=… npm run verify:live` reports **25/25 ok** (contract honoured by the live anchor).
4. The Phase 5 scope predicates can be written as **new** migrations on top of the now-tracked helpers.

## Steps

**0. Get a read-only connection string.** Supabase dashboard → Project → Database → Connection
string (prefer the read-only pooler). Export it as `DATABASE_URL`; never commit it.

**1. Extract the helpers + RPCs for review (fast, targeted):**
```bash
cd packages/db
DATABASE_URL="postgres://…anchor…" node scripts/dump-functions.mjs
#   → writes packages/db/live-defs/*.sql (is_moderator, is_hod, the 25 RPCs, any *_scope helpers)
```
Read `live-defs/` — this is the out-of-band schema, now visible. It tells you exactly what Phase 5's
predicates must extend.

**2. Seed the full migration bodies (canonical, drift-free):**
```bash
ANCHOR_REF=uvzukwoxqhcxaxtzrziy ./scripts/seed-bodies.sh   # supabase db pull + check:ledger
```

**3. Reconcile against the ledger.** `supabase db pull` may emit a squashed file; rename/split the
output into `migrations/<version>_<name>.sql` matching `LEDGER.json` (110 versions). Iterate:
```bash
npm run check:ledger      # lists ledger versions still missing a body, and any extra files
```
until it reports `✓ migrations/ matches the anchor ledger`.

**4. Verify the contract against live:**
```bash
DATABASE_URL="postgres://…anchor…" npm run verify:live   # expect: ok 25 / missing 0 / mismatched 0
```

**5. Commit** the seeded `migrations/*.sql` + `live-defs/*.sql` as the source of truth. The
`db-contract` CI now runs for real (builds an ephemeral Postgres from the bodies and asserts the
contract) instead of skipping.

## What this unblocks next
- **Phase 5** — write the `slt`/`trust_lead` scope predicates + tighten `class_intervention_list` to
  slt-only + the subtractive secret-restriction migration, all as new migrations reviewed against
  `live-defs/`. (See `PHASE5_REGATE_RPCS.md`.)
- **Phase B** — `@feynman/db` becomes a real dependency feynman can import typed contracts from,
  instead of an orphan package (rehearsal conflict #5).

## Don't
- Don't hand-transcribe the schema from the two old repos — pull from live, which is drift-free.
- Don't apply `live-defs/` or pulled SQL back to the anchor — it's already there; this is a one-way
  capture into source.
