#!/usr/bin/env bash
# =====================================================================
# Feynman Education — DB security test runner.
#
# Applies the base fixture + every migration (in order) + test grants to a
# throwaway Postgres, then runs the RLS / SECURITY-DEFINER assertions. Exits
# non-zero on the first failed assertion (psql ON_ERROR_STOP).
#
# Connection uses standard libpq env vars; defaults suit a CI service container:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
#
# Local quick start (Docker):
#   docker run -d --rm --name fe-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
#   PGPASSWORD=postgres ./supabase/tests/run.sh
# =====================================================================
set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc -q)

echo "→ resetting schema on $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
"${PSQL[@]}" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
DROP SCHEMA IF EXISTS auth CASCADE;
SQL

echo "→ applying base fixture (00_base.sql)"
"${PSQL[@]}" -f "$HERE/00_base.sql"

echo "→ applying migrations"
# Two wrinkles a fresh DB exposes that prod doesn't:
#   1. Several migrations SEED rows that reference prod curriculum data (units,
#      topics) absent here. Those FKs are irrelevant to the security surface, so
#      we apply with FK/trigger enforcement off (session_replication_role=
#      replica) — constraints are still CREATED, just not enforced on seeds.
#   2. Same-date migrations are apply-ORDER dependent, but filename sort doesn't
#      always match the order they were applied in prod (e.g. mis_classes refs
#      schools, created in schools_roles). Rather than hard-code an order, we
#      apply in dependency order by RETRYING: each pass applies whatever now
#      succeeds (each file in a single rolled-back-on-error transaction) until a
#      full pass makes no progress. If a pass stalls, the remaining errors are
#      surfaced and the run fails.
# Skip data-backfill migrations whose bodies JOIN retrieval-app-OWNED tables
# (public.topics / public.topic_map). Those tables live in the separate
# retrieval-app migration set (the "two repos, one schema" boundary), so they
# cannot exist in this repo's isolated test DB. The skipped files create no
# RLS policy / SECURITY DEFINER surface of their own — they only backfill data —
# so excluding them does not reduce security coverage.
SKIP_RETRIEVAL_BACKFILL="20260621_mastery_graph_objectives.sql"

remaining=()
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  case " $SKIP_RETRIEVAL_BACKFILL " in
    *" $(basename "$f") "*) echo "   ⤬ skip (retrieval-owned deps): $(basename "$f")"; continue ;;
  esac
  remaining+=( "$f" )
done
last_err=""
while [ ${#remaining[@]} -gt 0 ]; do
  next=(); progressed=0
  for f in "${remaining[@]}"; do
    if err=$("${PSQL[@]}" --single-transaction -c "SET session_replication_role = 'replica';" -f "$f" 2>&1); then
      echo "   • $(basename "$f")"
      progressed=1
    else
      next+=( "$f" ); last_err="$f:\n$err"
    fi
  done
  if [ "$progressed" -eq 0 ]; then
    echo "✗ migration order could not be resolved; remaining: ${remaining[*]##*/}"
    echo -e "last error → $last_err"
    exit 1
  fi
  remaining=( "${next[@]}" )
done

echo "→ applying test grants (10_grants.sql)"
"${PSQL[@]}" -f "$HERE/10_grants.sql"

echo "→ running security tests (20_security.test.sql)"
"${PSQL[@]}" -f "$HERE/20_security.test.sql"

echo "✓ DB security tests passed"
