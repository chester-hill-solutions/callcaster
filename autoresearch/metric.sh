#!/usr/bin/env bash
# Trusted measurement entrypoint for autoresearch.
# Runs timed typecheck + tests + build, reads quality baselines,
# prints ONE JSON line on stdout and appends it to autoresearch/runs/metrics-history.jsonl
#
# Exit codes: 0 ok | 2 no node_modules | 3 typecheck red | 4 tests red | 5 build red
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -d node_modules ]] || { echo '{"error":"node_modules missing"}'; exit 2; }
mkdir -p autoresearch/runs

now()  { date +%s.%N; }
dur()  { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", b-a}'; }

run_timed() { # $1 = log file, rest = command; echoes seconds on success
  local log="$1"; shift
  local t0 t1 rc
  t0=$(now)
  if ! "$@" >"$log" 2>&1; then
    return 1
  fi
  t1=$(now)
  dur "$t0" "$t1"
}

TYPECHECK_S=$(run_timed /tmp/ar-metric-typecheck.log npm run --silent typecheck) \
  || { echo "typecheck failed — see /tmp/ar-metric-typecheck.log" >&2; exit 3; }

TEST_NODE_S=$(run_timed /tmp/ar-metric-test-node.log npm run --silent test:node) \
  || { echo "test:node failed — see /tmp/ar-metric-test-node.log" >&2; exit 4; }
TEST_UI_S=$(run_timed /tmp/ar-metric-test-ui.log npm run --silent test:ui) \
  || { echo "test:ui failed — see /tmp/ar-metric-test-ui.log" >&2; exit 4; }

BUILD_S=$(run_timed /tmp/ar-metric-build.log npm run --silent build) \
  || { echo "build failed — see /tmp/ar-metric-build.log" >&2; exit 5; }

BUNDLE_BYTES=$(find build/client/assets -type f -name '*.js' -printf '%s\n' 2>/dev/null \
  | awk '{s+=$1} END{print s+0}')

# Live quality counts from the three ratchet referees.
# Each exits non-zero on regression vs its baseline, which fails measurement.
TS_OUT=$(node scripts/check-type-safety.mjs 2>&1)
if [[ $? -ne 0 ]]; then echo "type-safety regression" >&2; echo "$TS_OUT" >&2; exit 6; fi
TS_JSON=$(printf '%s' "$TS_OUT" | grep -o '{.*}')

if ! npm run --silent check:dry > /tmp/ar-metric-dry.log 2>&1; then
  echo "dry regression — see /tmp/ar-metric-dry.log" >&2; exit 6
fi
DRY_CLONES=$(grep -oE '[0-9]+ clones' /tmp/ar-metric-dry.log | head -1 | grep -oE '[0-9]+')

if ! npm run --silent check:effects > /tmp/ar-metric-effects.log 2>&1; then
  echo "effects regression — see /tmp/ar-metric-effects.log" >&2; exit 6
fi
EFF_GRAND=$(grep -oE '[0-9]+ grandfathered' /tmp/ar-metric-effects.log | head -1 | grep -oE '^[0-9]+')

QUALITY_JSON=$( \
TS_JSON="$TS_JSON" DRY_CLONES="$DRY_CLONES" EFF_GRAND="$EFF_GRAND" \
node --input-type=module -e '
const ts = JSON.parse(process.env.TS_JSON);
const q = {
  type_safety_total: Object.values(ts).reduce((a, b) => a + Number(b), 0),
  dry_clones: Number(process.env.DRY_CLONES),
  effects: Number(process.env.EFF_GRAND),
};
console.log(JSON.stringify(q));
')

METRICS_JSON=$( \
TYPECHECK_S="$TYPECHECK_S" TEST_NODE_S="$TEST_NODE_S" TEST_UI_S="$TEST_UI_S" \
BUILD_S="$BUILD_S" BUNDLE_BYTES="$BUNDLE_BYTES" QUALITY_JSON="$QUALITY_JSON" \
node --input-type=module -e '
const q = JSON.parse(process.env.QUALITY_JSON);
const out = {
  ts: new Date().toISOString(),
  typecheck_s: Number(process.env.TYPECHECK_S),
  test_s: Number(process.env.TEST_NODE_S) + Number(process.env.TEST_UI_S),
  build_s: Number(process.env.BUILD_S),
  bundle_bytes: Number(process.env.BUNDLE_BYTES),
  quality: q,
  quality_count: (q.type_safety_total ?? 0) + (q.dry_clones ?? 0) + (q.effects ?? 0),
};
console.log(JSON.stringify(out));
')

echo "$METRICS_JSON" >> autoresearch/runs/metrics-history.jsonl
echo "$METRICS_JSON"
