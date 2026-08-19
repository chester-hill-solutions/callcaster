#!/usr/bin/env bash
# Clone one Railway Postgres database into another (#1300).
#
# Used to bring dev's workspaces into staging (phase 2 rehearsal) and later
# into production (phase 3 cutover) — both sides run the same schema lineage,
# so this is a straight dump/restore, not a migration.
#
# Usage:
#   SOURCE_DATABASE_URL=postgres://… TARGET_DATABASE_URL=postgres://… \
#     CONFIRM_CLONE=yes scripts/db/clone-database.sh
#
# The target is WIPED (--clean). CONFIRM_CLONE=yes is required, and the target
# host:port/db is printed for a 5-second abort window before anything runs.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

if [[ "${CONFIRM_CLONE:-}" != "yes" ]]; then
  echo "Refusing to run without CONFIRM_CLONE=yes (the target database is wiped)." >&2
  exit 1
fi
if [[ "$SOURCE_DATABASE_URL" == "$TARGET_DATABASE_URL" ]]; then
  echo "Source and target are the same database — aborting." >&2
  exit 1
fi

describe() { python3 -c "from urllib.parse import urlparse;u=urlparse('$1');print(f'{u.hostname}:{u.port}{u.path}')"; }
echo "Source: $(describe "$SOURCE_DATABASE_URL")"
echo "TARGET (will be wiped): $(describe "$TARGET_DATABASE_URL")"
echo "Starting in 5s — Ctrl-C to abort."
sleep 5

DUMP_FILE=$(mktemp -t callcaster-clone-XXXXXX.dump)
trap 'rm -f "$DUMP_FILE"' EXIT

echo "Dumping source…"
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$SOURCE_DATABASE_URL" --file="$DUMP_FILE"

echo "Restoring into target…"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$TARGET_DATABASE_URL" "$DUMP_FILE"

echo "Verifying…"
for url in "$SOURCE_DATABASE_URL" "$TARGET_DATABASE_URL"; do
  psql "$url" --tuples-only --no-align --command \
    "select current_database() || ': ' || count(*) || ' workspaces' from workspace" 2>/dev/null \
    || psql "$url" --tuples-only --no-align --command \
      "select current_database() || ': ' || count(*) || ' public tables' from information_schema.tables where table_schema='public'"
done

echo "Clone complete."
