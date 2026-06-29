#!/usr/bin/env bash
# Apply Phase 1 schema transform scripts to Railway review ONLY.
# Requires: psql, DATABASE_URL or DATABASE_PUBLIC_URL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL="${DATABASE_PUBLIC_URL:-${DATABASE_URL:-}}"

if [[ -z "$URL" ]]; then
  echo "Set DATABASE_URL or DATABASE_PUBLIC_URL (Railway review Postgres only)." >&2
  exit 1
fi

echo "Target: ${URL%%@*}@***"
echo "Confirm this is Railway visual-asset-review, not hosted Supabase prod. Abort in 5s..."
sleep 5

STEPS=(
  00-preflight.sql
  01-drop-vestigial.sql
  01c-drop-audience-trigger.sql
  02-consolidate-campaign.sql
  02b-backfill-campaign.sql
  03-normalize-campaign-queue.sql
  03a-rewrite-queue-rpcs.sql
  03b-drop-queue-status.sql
  04-contact-prune.sql
  05-drop-rcs-onboarding.sql
  08-household-key.sql
  08b-household-backfill.sql
  10-verify.sql
)

for step in "${STEPS[@]}"; do
  f="$ROOT/scripts/schema-transform/$step"
  [[ -f "$f" ]] || continue
  echo ""
  echo "==> $step"
  psql "$URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo ""
echo "Optional sketches (not in default apply): 06, 07, 09"
echo "Baseline: bash scripts/schema-transform/dump-baseline.sh"
