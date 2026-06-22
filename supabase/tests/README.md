# DB security tests

Replays the migration set onto a throwaway Postgres and asserts the
security-critical behaviour that unit tests can't reach:

- **RLS isolation** — a teacher cannot read or write another teacher's rows.
- **`SECURITY DEFINER` role gates** — `school_classes()` returns cross-teacher
  rows only to `hod`/`slt` callers, scoped to their own school.
- **Privilege-escalation guards** — `set_school_member_role()` rejects self-
  promotion and cross-school changes, and applies the happy path.
- **RLS coverage guardrail** — every table in `public` has RLS enabled, so a new
  table can't silently ship without tenant isolation.

## Run it

```bash
# against any empty Postgres (CI uses a postgres:16 service container)
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
  npm run test:db
```

Locally with Docker:

```bash
docker run -d --rm --name fe-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
PGPASSWORD=postgres npm run test:db
```

## How it works

- `00_base.sql` — recreates the small pre-migration base that predates the
  migration log (the Supabase `auth` surface, the three roles, the pre-existing
  enums/tables the migrations ALTER). It's a **test approximation** of prod, not
  authoritative schema.
- `run.sh` — resets the schema, applies the base, then applies every migration
  in **dependency order** (it retries until a pass makes no progress, because
  same-date migrations aren't filename-ordered), with FK/trigger enforcement off
  so prod-data seeds don't block. Data-backfill migrations that join
  retrieval-app-owned tables (`topics`/`topic_map`, the "two repos, one schema"
  boundary) are skipped — they define no security surface here.
- `10_grants.sql` — re-creates Supabase's default `anon`/`authenticated` grants
  so RLS, not a missing grant, is what gates access.
- `20_security.test.sql` — the assertions (each `RAISE`s on failure; psql runs
  with `ON_ERROR_STOP`).

The Stripe webhook signature check is covered separately in
`src/lib/stripe.test.ts`.
