#!/usr/bin/env bash
# Seed packages/db/migrations/*.sql bodies from the LIVE anchor, then verify
# against LEDGER.json. Run from a machine with the Supabase CLI + DB egress
# (the agent sandbox has neither). One-time step — see migrations/README.md.
#
#   ANCHOR_REF=uvzukwoxqhcxaxtzrziy ./scripts/seed-bodies.sh
#
set -euo pipefail

ANCHOR_REF="${ANCHOR_REF:-uvzukwoxqhcxaxtzrziy}"
cd "$(dirname "$0")/.."   # -> packages/db

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ Supabase CLI not found. Install it: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

echo "→ Linking to anchor project: $ANCHOR_REF"
supabase link --project-ref "$ANCHOR_REF"

echo "→ Pulling the live schema (writes to supabase/migrations/ by default)…"
supabase db pull

cat <<'NOTE'

Next (manual, one time):
  1. Move the pulled SQL into packages/db/migrations/, naming each file
     <version>_<name>.sql so the version prefix matches LEDGER.json.
     (supabase db pull may emit one squashed file; split or rename as needed.)
  2. Re-run the consistency check:

NOTE

echo "→ Checking migrations/ against LEDGER.json…"
npm run --silent check:ledger || {
  echo
  echo "↑ Some ledger versions still have no .sql body (or extra files exist)."
  echo "  Fix the filenames per the list above, then re-run: npm run check:ledger"
  exit 1
}

echo "✓ migrations/ matches the anchor ledger. Now the db-contract test can run for real:"
echo "    DATABASE_URL=postgres://postgres:postgres@localhost:5432/contract npm run apply"
echo "    DATABASE_URL=postgres://postgres:postgres@localhost:5432/contract npm test"
