#!/usr/bin/env bash
# Phase 3 rehearsal runner — runs the 3 steps (load → reconcile → verify) against a
# TARGET database (use a Supabase BRANCH first, never prod). Idempotent-ish: re-running
# after a failure is fine because reconcile is wrapped in a transaction.
#
# Usage:
#   1. Create a branch off the anchor (dashboard, or `supabase branches create`).
#   2. Put both connection strings in db/unification/.env.migrate.local  (gitignored):
#        TEACHER="postgresql://postgres:<pwd>@db.uujbgdwnuspfnvfpdtvr.supabase.co:5432/postgres"
#        TARGET="postgresql://postgres:<pwd>@<branch-db-host>:5432/postgres"
#   3. ./run.sh
#
# Needs the Postgres client (psql, pg_dump). On macOS:  brew install libpq && brew link --force libpq
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env.migrate.local ] && set -a && . ./.env.migrate.local && set +a
: "${TEACHER:?set TEACHER (teacher DB URI) in .env.migrate.local or the environment}"
: "${TARGET:?set TARGET (BRANCH DB URI — never prod) in .env.migrate.local or the environment}"
command -v psql    >/dev/null || { echo "psql not found — brew install libpq && brew link --force libpq"; exit 1; }
command -v pg_dump >/dev/null || { echo "pg_dump not found — brew install libpq && brew link --force libpq"; exit 1; }

echo "TARGET = ${TARGET%%@*}@…   (rehearse on a branch — Ctrl-C now if this is prod)"; sleep 3

echo "== step 1/3: load teacher schema+data into the feynman staging schema =="
pg_dump "$TEACHER" --schema=public --no-owner --no-privileges -Fp \
  | sed -E 's/\bpublic\./feynman./g' \
  | sed -E 's/feynman\.(gen_random_uuid|uuid_generate_v4)/\1/g' \
  | sed 's/ab56a97d-b326-434b-bd0f-1a894fb15819/cef87533-7ff1-4f93-bfcf-22feb66f896a/g' \
  | sed '1i CREATE SCHEMA IF NOT EXISTS feynman;' \
  | psql "$TARGET" -v ON_ERROR_STOP=1 -f -

echo "== step 2/3: reconcile =="
psql "$TARGET" -v ON_ERROR_STOP=1 -f 10_reconcile.sql

echo "== step 3/3: verify =="
psql "$TARGET" -v ON_ERROR_STOP=1 -f 20_verify.sql

echo "== done. Review the verify output above; paste it back if anything looks off. =="
