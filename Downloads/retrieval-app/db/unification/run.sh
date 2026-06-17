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

# Make Postgres.app's psql/pg_dump available if installed (no Homebrew needed).
for pgbin in /Applications/Postgres.app/Contents/Versions/*/bin /Library/PostgreSQL/*/bin /opt/homebrew/opt/libpq/bin; do
  if [ -d "$pgbin" ]; then PATH="$pgbin:$PATH"; fi
done
export PATH

# First run: create the creds file, open it, and stop so you can fill in passwords.
if [ ! -f .env.migrate.local ]; then
  cat > .env.migrate.local <<'TEMPLATE'
# Replace [YOUR-PASSWORD] in BOTH lines with each project's DB password
# (Supabase -> project -> Settings -> Database -> Connection string -> URI; or reset the password there).
# TEACHER = ScienceKit/Feynman project, TARGET = retrieval-app (the anchor / prod). Then save and re-run ./run.sh
TEACHER="postgresql://postgres:[YOUR-PASSWORD]@db.uujbgdwnuspfnvfpdtvr.supabase.co:5432/postgres"
TARGET="postgresql://postgres:[YOUR-PASSWORD]@db.uvzukwoxqhcxaxtzrziy.supabase.co:5432/postgres"
TEMPLATE
  if command -v open >/dev/null; then open -e .env.migrate.local; fi
  echo "Created .env.migrate.local and opened it in TextEdit. Fill in BOTH passwords, save, then run ./run.sh again."
  exit 1
fi

set -a; . ./.env.migrate.local; set +a
: "${TEACHER:?TEACHER not set — edit db/unification/.env.migrate.local}"
: "${TARGET:?TARGET not set — edit db/unification/.env.migrate.local}"
if printf '%s' "$TEACHER$TARGET" | grep -q 'YOUR-PASSWORD'; then
  echo "Still placeholders in .env.migrate.local — replace [YOUR-PASSWORD] in both lines, save, re-run."; exit 1
fi
command -v pg_dump >/dev/null || { echo "pg_dump not found. Install Postgres.app (postgresapp.com), open it once, then re-run ./run.sh"; exit 1; }
command -v psql    >/dev/null || { echo "psql not found. Install Postgres.app (postgresapp.com), open it once, then re-run ./run.sh"; exit 1; }

echo "TARGET = ${TARGET%%@*}@…  — this WRITES to that database (the anchor). Ctrl-C within 5s to abort."; sleep 5

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
