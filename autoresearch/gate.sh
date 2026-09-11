#!/usr/bin/env bash
# Trusted structural gate for autoresearch.
# Exit 0 = pass; non-zero = fail. Prints a machine-readable summary.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAIL=0
REPORT=()
pass() { REPORT+=("PASS: $1"); }
fail() { REPORT+=("FAIL: $1"); FAIL=1; }

if [[ ! -d node_modules ]]; then
  echo "FAIL: node_modules missing — run npm ci first"
  exit 2
fi

CHECKS=(
  tools:routes:verify
  tools:api:surface:check
  check:route-server-leaks
  check:route-authz
  check:route-membership
  check:workspace-projection
  check:twilio-webhooks
  check:request-body-consumption
  check:middleware
  check:credit-writes
  check:dual-auth
  check:effects
  check:type-safety
  check:pg-errors
  check:dry
  check:handlers
  check:db-rpcs
  check:queue-rpc-contract
  check:client-bundle
  tools:check-file-size
)

for c in "${CHECKS[@]}"; do
  if npm run --silent "$c" >/tmp/ar-gate-last.log 2>&1; then
    pass "$c"
  else
    tail -20 /tmp/ar-gate-last.log > /tmp/ar-gate-fail.log || true
    fail "$c (see /tmp/ar-gate-fail.log)"
  fi
done

echo "---"
echo "gate fail: $FAIL"
for line in "${REPORT[@]}"; do echo "$line"; done
echo "---"

exit "$(( FAIL != 0 ))"
