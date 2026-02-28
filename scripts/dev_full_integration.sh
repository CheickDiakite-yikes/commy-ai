#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read_env_value() {
  local key="$1"
  local env_file="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$env_file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  local value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "${#value}" -ge 2 && "${value:0:1}" == "\"" && "${value: -1}" == "\"" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${#value}" -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf "%s" "$value"
}

if [[ -z "${DATABASE_URL:-}" && -f ".env" ]]; then
  DATABASE_URL="$(read_env_value DATABASE_URL ".env" || true)"
fi

DATABASE_URL="${DATABASE_URL:-postgresql://127.0.0.1:5432/commy_dev}"
if [[ "$DATABASE_URL" == *"<user>"* || "$DATABASE_URL" == *"<password>"* ]]; then
  cat >&2 <<'EOF'
DATABASE_URL in .env still contains placeholder values (<user>/<password>).
Set a real connection string, for example:
DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/commy_dev
EOF
  exit 1
fi

redact_db_url() {
  local value="$1"
  printf "%s" "$value" | sed -E 's#(://)[^:/@]+(:[^/@]+)?@#\1***:***@#'
}

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

select_admin_db_url() {
  local candidate
  for candidate in "${db_base}/postgres" "${db_base}/template1"; do
    if "$PSQL_BIN" "$candidate" -tAc "SELECT 1" >/dev/null 2>&1; then
      printf "%s" "$candidate"
      return 0
    fi
  done
  return 1
}

connect_error=""
if ! connect_output="$("$PSQL_BIN" "$DATABASE_URL" -tAc "SELECT 1" 2>&1)"; then
  connect_error="$connect_output"
fi
if [[ -n "$connect_error" ]]; then
  if [[ "$connect_error" == *"failed to verify \"trust\" authentication"* ]]; then
    cat >&2 <<'EOF'
PostgreSQL is running with trust auth via Postgres.app, but authentication prompt failed.
Fix:
1. Restart Postgres.app (or your local Postgres service)
2. If needed, switch to password auth and set DATABASE_URL with user/password in .env
3. Re-run: npm run dev
EOF
    exit 1
  fi
  if [[ "$connect_error" == *"password authentication failed"* ]]; then
    cat >&2 <<'EOF'
PostgreSQL password authentication failed.
Set a valid DATABASE_URL in .env, e.g.
DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/commy_dev
EOF
    exit 1
  fi
  echo "Database '$db_name' not reachable; attempting to create it..."
  admin_db_url="$(select_admin_db_url || true)"
  if [[ -z "$admin_db_url" ]]; then
    echo "Unable to find an admin database (tried 'postgres' and 'template1')." >&2
    echo "Original connection error:" >&2
    echo "$connect_error" >&2
    exit 1
  fi
  if ! exists="$("$PSQL_BIN" "$admin_db_url" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" 2>/dev/null)"; then
    echo "Unable to query postgres admin DB at '$(redact_db_url "$admin_db_url")'." >&2
    echo "Original connection error:" >&2
    echo "$connect_error" >&2
    exit 1
  fi
  if [[ "$exists" != "1" ]]; then
    "$PSQL_BIN" "$admin_db_url" -c "CREATE DATABASE \"$db_name\";" >/dev/null 2>&1 || {
      echo "Failed to create database '$db_name'." >&2
      exit 1
    }
    echo "Created database '$db_name'."
  fi
fi

echo "Applying schema to $(redact_db_url "$DATABASE_URL") ..."
"$PSQL_BIN" "$DATABASE_URL" -f server/schema.sql >/dev/null
echo "Database ready."

exec npm run dev:all
