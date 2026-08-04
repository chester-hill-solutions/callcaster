#!/usr/bin/env bash
# Dump squashed schema baseline from Railway review (requires Docker or pg_dump 18+).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/drizzle/0000_baseline.sql"

if [[ -z "${DATABASE_PUBLIC_URL:-}" ]]; then
  echo "Run via: railway service 'PostgreSQL 18' && railway run -- bash -lc 'DATABASE_PUBLIC_URL=\$DATABASE_PUBLIC_URL bash scripts/schema-transform/dump-baseline.sh'"
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  docker run --rm -e DATABASE_URL="$DATABASE_PUBLIC_URL" postgres:18-alpine \
    pg_dump "$DATABASE_PUBLIC_URL" --schema-only --no-owner --no-privileges > "$OUT"
elif pg_dump --version 2>&1 | grep -qE 'pg_dump \(PostgreSQL\) (1[89]|[2-9][0-9])'; then
  pg_dump "$DATABASE_PUBLIC_URL" --schema-only --no-owner --no-privileges > "$OUT"
else
  echo "Need Docker or pg_dump 18+ (local pg_dump is too old for Railway PG 18)." >&2
  exit 1
fi

echo "Wrote $OUT ($(wc -l < "$OUT") lines)"
