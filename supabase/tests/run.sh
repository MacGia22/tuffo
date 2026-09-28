#!/usr/bin/env bash
# Row-level-security tests on a local Postgres 16 server.
#
#   RLS_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
#
# Creates a fresh database on that server (dropped again on exit), adds the stand-in
# auth schema, applies every migration, applies each one a second time (the migrate job
# may retry), then runs rls.sql. With --expect-failure it first breaks a policy on
# purpose and succeeds only if rls.sql catches it, which proves the tests can fail.
# RLS_DB_URL must be a superuser on a local or CI server, never the Supabase project.
set -euo pipefail

cd "$(dirname "$0")/../.."
admin="${RLS_DB_URL:?set RLS_DB_URL to a local Postgres superuser URL}"
if [[ "$admin" == *supabase.co* || "$admin" == *supabase.com* ]]; then
  echo "RLS_DB_URL points at Supabase; use a local or CI Postgres" >&2
  exit 2
fi

db="tuffo_rls_$$"
psql -X -q -v ON_ERROR_STOP=1 "$admin" -c "create database $db"
trap 'psql -X -q "$admin" -c "drop database if exists $db with (force)"' EXIT
if [[ "$admin" == *\?* ]]; then url="$admin&dbname=$db"; else url="$admin?dbname=$db"; fi
export PGOPTIONS="-c client_min_messages=warning"
psql=(psql "$url" -X -q -v ON_ERROR_STOP=1)

# Applied by hand before the migrate job existed and recorded as applied, so they never
# run again in production; the first one uses plain "create trigger/policy" and cannot
# run twice. Every later migration must.
not_rerunnable=(20260918000001_init.sql)

"${psql[@]}" -f supabase/tests/auth-stub.sql

migrations=(supabase/migrations/*.sql)
for file in "${migrations[@]}"; do
  echo "apply   ${file##*/}"
  "${psql[@]}" -f "$file"
done
for file in "${migrations[@]}"; do
  name="${file##*/}"
  if [[ " ${not_rerunnable[*]} " == *" $name "* ]]; then
    echo "skip    $name (hand-applied, not re-runnable)"
    continue
  fi
  echo "re-run  $name"
  "${psql[@]}" -f "$file"
done

if [[ "${1:-}" == "--expect-failure" ]]; then
  echo "sabotage: readings policy opened to every signed-in user"
  "${psql[@]}" -f supabase/tests/sabotage.sql
  if "${psql[@]}" -o /dev/null -f supabase/tests/rls.sql; then
    echo "::error::rls.sql passed against a broken policy"
    exit 1
  fi
  echo "ok: rls.sql caught the broken policy"
  exit 0
fi

"${psql[@]}" -o /dev/null -f supabase/tests/rls.sql
echo "ok: row-level security holds"
