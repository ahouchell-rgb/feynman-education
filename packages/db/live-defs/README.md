# live-defs/

Read-only snapshots of the **live anchor** function definitions, produced by
`../scripts/dump-functions.mjs`. They capture the contract RPCs and the auth/role
helpers (`is_moderator`, `is_hod`, …) that were applied to the anchor out-of-band
and never committed — so they become **reviewable source** for the Phase 5 re-gate.

These files are **not migrations** — do not apply them. They're the reference you
read while writing the real, ordered migrations into `../migrations/`. See
[`docs/SCHEMA_RECONCILIATION.md`](../../../docs/SCHEMA_RECONCILIATION.md).

Populate with:

```bash
cd packages/db
DATABASE_URL="postgres://…read-only anchor…" node scripts/dump-functions.mjs
```
