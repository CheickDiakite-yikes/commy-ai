#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/commy_dev}"

find_pg_bin() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    command -v "$cmd"
    return 0
  fi
  local homebrew_path="/opt/homebrew/opt/postgresql@17/bin/$cmd"
  if [[ -x "$homebrew_path" ]]; then
    echo "$homebrew_path"
    return 0
  fi
  return 1
}

PSQL_BIN="$(find_pg_bin psql || true)"
if [[ -z "$PSQL_BIN" ]]; then
  echo "psql not found. Install PostgreSQL and ensure 'psql' is on PATH." >&2
  exit 1
fi

db_url_no_params="${DATABASE_URL%%\?*}"
db_name="${db_url_no_params##*/}"
db_base="${db_url_no_params%/*}"
admin_db_url="${db_base}/postgres"

if ! "$PSQL_BIN" "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
  echo "Database '$db_name' not reachable; attempting to create it..."
  exists="$("$PSQL_BIN" "$admin_db_url" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db_name'")"
  if [[ "$exists" != "1" ]]; then
    "$PSQL_BIN" "$admin_db_url" -c "CREATE DATABASE \"$db_name\";" >/dev/null
    echo "Created database '$db_name'."
  fi
fi

echo "Applying schema to $DATABASE_URL ..."
"$PSQL_BIN" "$DATABASE_URL" -f server/schema.sql >/dev/null
echo "Database ready."

exec npm run dev:all
