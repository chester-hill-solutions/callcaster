#!/usr/bin/env bash
# Cron entrypoint: one autoresearch batch via opencode, then exit.
# Safe to invoke every N minutes — flock prevents overlap.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/autoresearch/cron.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/autoresearch/cron.env"
fi

: "${AUTORESEARCH_TAG:=pilot1}"
: "${AUTORESEARCH_BRANCH:=autoresearch/${AUTORESEARCH_TAG}}"
: "${AUTORESEARCH_MODEL:=opencode/big-pickle}"
: "${AUTORESEARCH_REVIEW_MODEL:=opencode/gpt-5.6-sol}"
: "${AUTORESEARCH_REMEDIATE_MODEL:=$AUTORESEARCH_MODEL}"
: "${AUTORESEARCH_MAX_TURNS:=5}"
: "${AUTORESEARCH_TIMEOUT_SECS:=7200}"
: "${AUTORESEARCH_LOG_DIR:=$ROOT/autoresearch/runs/cron}"
: "${AUTORESEARCH_LOCK:=$ROOT/autoresearch/runs/cron/autoresearch.lock}"
: "${AUTORESEARCH_AUTO:=1}"
: "${AUTORESEARCH_PUSH:=1}"
: "${AUTORESEARCH_REMOTE:=origin}"
: "${AUTORESEARCH_PUSH_MAIN:=0}"
: "${AUTORESEARCH_REVIEW:=1}"
: "${AUTORESEARCH_REVIEW_MAX_ROUNDS:=2}"
: "${AUTORESEARCH_REVIEW_TIMEOUT_SECS:=1800}"

mkdir -p "$AUTORESEARCH_LOG_DIR"
LOG="$AUTORESEARCH_LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ).log"

exec 9>"$AUTORESEARCH_LOCK"
if ! flock -n 9; then
  echo "$(date -u +%FT%TZ) skip: another run holds the lock" >> "$AUTORESEARCH_LOG_DIR/skip.log"
  exit 0
fi

{
  echo "=== autoresearch cron start $(date -u +%FT%TZ) ==="
  echo "root=$ROOT branch=$AUTORESEARCH_BRANCH model=$AUTORESEARCH_MODEL max_turns=$AUTORESEARCH_MAX_TURNS"

  # Cron-friendly toolchain bootstrap (no-op when already on PATH)
  export HOME="${HOME:-/home/nathaniel-arfin}"
  NVM_BIN="$(ls -d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -V | tail -1)"
  export PATH="$HOME/.opencode/bin:$HOME/.bun/bin:$HOME/.local/bin:${NVM_BIN:+$NVM_BIN/bin:}:/usr/local/bin:/usr/bin:/bin"

  echo "path_check node=$(command -v node || echo MISSING) bun=$(command -v bun || echo MISSING) opencode=$(command -v opencode || echo MISSING)"
  command -v opencode >/dev/null || { echo "ERROR: opencode not on PATH" >&2; exit 1; }
  command -v node >/dev/null    || { echo "ERROR: node not on PATH" >&2; exit 1; }
  [[ -d .git ]]                 || { echo "ERROR: not a git repo: $ROOT" >&2; exit 1; }

  current="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current" != "$AUTORESEARCH_BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$AUTORESEARCH_BRANCH"; then
      git checkout "$AUTORESEARCH_BRANCH"
    else
      git checkout -b "$AUTORESEARCH_BRANCH"
    fi
  fi
  if [[ "$current" =~ ^(dev|main|master)$ && "$current" != "$AUTORESEARCH_BRANCH" ]]; then
    : # we switched away from mainline above; safe
  fi

  # Runtime dirt under autoresearch/ is expected; anything else is WIP from an interrupted turn.
  dirty="$(git status --porcelain | awk '{print $NF}' | grep -vE '^autoresearch/' || true)"
  RECOVERY_PRELUDE=""
  if [[ -n "${dirty}" ]]; then
    if [[ "${AUTORESEARCH_RECOVER_WIP:-1}" == "1" ]]; then
      echo "NOTE: interrupted-turn WIP detected:"
      printf '%s\n' "$dirty"
      RECOVERY_PRELUDE=$(printf '%s\n' "$dirty" > /tmp/ar-wip.txt; cat <<EOF
RECOVERY REQUIRED first (interrupted previous turn). These paths are dirty outside
autoresearch runtime:
$(sed 's/^/  - /' /tmp/ar-wip.txt)
Run bash autoresearch/gate.sh, then either complete the hypothesis this WIP belongs to,
pass gate+metric, and commit it as a kept turn, or revert only those files (branch-local)
and log a discard. Do NOT mix recovery into a later commit.

EOF
)
    else
      echo "ERROR: dirty tree outside autoresearch runtime and AUTORESEARCH_RECOVER_WIP=0:" >&2
      echo "$dirty" >&2
      exit 1
    fi
  fi

  # Baseline gate — hard stop if red
  if ! bash autoresearch/gate.sh; then
    echo "ERROR: baseline gate failed; not starting agent" >&2
    exit 1
  fi

  run_opencode() {
    local prompt="$1" title="$2" model="${3:-}" timeout_secs="${4:-$AUTORESEARCH_TIMEOUT_SECS}"
    local args=(run --format default --title "$title")
    [[ -n "$model" ]] && args+=(-m "$model")
    [[ "$AUTORESEARCH_AUTO" == "1" ]] && args+=(--auto)
    args+=("$prompt")
    timeout --signal=TERM --kill-after=60 "$timeout_secs" opencode "${args[@]}"
  }

  BUILD_PROMPT=$(cat <<EOF
${RECOVERY_PRELUDE}Read autoresearch/program.md and continue the autoresearch loop on branch ${AUTORESEARCH_BRANCH} (tag ${AUTORESEARCH_TAG}).

Rules for this batch — BUILD phase:
- Setup is already done. Ask the human nothing.
- Run at most ${AUTORESEARCH_MAX_TURNS} full turns (select → sharpen → checkpoint → build → gate → measure → decide).
- Export/use MAX_TURNS=${AUTORESEARCH_MAX_TURNS}.
- Commit only kept turns on ${AUTORESEARCH_BRANCH}. Never push. The wrapper pushes after review.
- Update notepad.md, whiteboard.md, results.tsv, state.json, journal.jsonl exactly as program.md requires.
- Rotate focus across test_s, typecheck_s, bundle_bytes, quality_count.
Begin the next turn now.
EOF
)

  echo "=== PHASE: BUILD ==="
  set +e
  run_opencode "$BUILD_PROMPT" "ar-cron-build-${AUTORESEARCH_TAG}" "$AUTORESEARCH_MODEL" "$AUTORESEARCH_TIMEOUT_SECS"
  build_ec=$?
  set -e
  echo "build exit=$build_ec"

  final_ec="$build_ec"

  if [[ "$AUTORESEARCH_REVIEW" == "1" ]]; then
    REVIEW_BASE="origin/${AUTORESEARCH_BRANCH}"
    git fetch "$AUTORESEARCH_REMOTE" "$AUTORESEARCH_BRANCH" 2>/dev/null || true
    if ! git rev-parse --verify --quiet "$REVIEW_BASE" >/dev/null; then
      echo "WARN: no origin tip for ${AUTORESEARCH_BRANCH}; reviewing HEAD^..HEAD"
      REVIEW_BASE="HEAD^"
    fi
    echo "review_base=$REVIEW_BASE"
    MK="$ROOT/autoresearch/runs/cron/review"
    rm -rf "$MK"; mkdir -p "$MK"
    git diff "${REVIEW_BASE}..HEAD" --stat > "$MK/diff-stat.txt" 2>&1 || true

    for round in $(seq 1 "$AUTORESEARCH_REVIEW_MAX_ROUNDS"); do
      echo "--- review round $round ---"
      REVIEW_PROMPT=$(cat <<EOF
You are the REVIEWER for the autoresearch batch on branch ${AUTORESEARCH_BRANCH}.
Review the diff ${REVIEW_BASE}..HEAD against autoresearch/program.md (especially the
Forbidden operations section), autoresearch/rubric.md mandatory gates, and repo AGENTS.md
conventions. Find REAL defects only: gamed numbers, deleted tests/features, config
relaxations, behavior changes, scope escapes. Do not nitpick style. Do not fix anything.
Write findings to autoresearch/whiteboard-review.md, one block per issue:

## REV-n: <short title>
- severity: high|medium|low
- file:
- evidence: <path:line or command>
- fix: <one concrete remediation>

Finish with exactly one line: REVIEW_RESULT: fail <count>   or   REVIEW_RESULT: pass
Only a genuine zero-real-defect result may say pass.
EOF
)
      set +e
      run_opencode "$REVIEW_PROMPT" "ar-cron-review-${AUTORESEARCH_TAG}-r${round}" "$AUTORESEARCH_REVIEW_MODEL" "$AUTORESEARCH_REVIEW_TIMEOUT_SECS"
      review_ec=$?
      set -e
      echo "review-$round exit=$review_ec"

      sed -i 's/\r$//' autoresearch/whiteboard-review.md 2>/dev/null || true
      if grep -q '^REVIEW_RESULT: pass' autoresearch/whiteboard-review.md 2>/dev/null; then
        echo "review round $round: PASS"
        rm -f autoresearch/whiteboard-review.md
        break
      fi
      echo "review round $round: findings present — remediating"

      REMEDIATE_PROMPT=$(cat <<EOF
You are the REMEDIATOR for the autoresearch batch on branch ${AUTORESEARCH_BRANCH}.
Fix every finding in autoresearch/whiteboard-review.md using its evidence and fix hints.
Rules:
- Touch only what the findings require. No scope expansion.
- Never weaken tests/gates to make a finding disappear; out-of-scope items go to
  autoresearch/whiteboard-blocked.md (one line each) instead of hacks.
- Re-run bash autoresearch/gate.sh before committing.
- Commit on ${AUTORESEARCH_BRANCH}: "R${round}: remediate review findings".
Commit only if something changed.
EOF
)
      set +e
      run_opencode "$REMEDIATE_PROMPT" "ar-cron-remediate-${AUTORESEARCH_TAG}-r${round}" "$AUTORESEARCH_REMEDIATE_MODEL" "$AUTORESEARCH_TIMEOUT_SECS"
      remed_ec=$?
      set -e
      echo "remediate-$round exit=$remed_ec"

      if [[ -f autoresearch/whiteboard-blocked.md ]]; then
        echo "HITL block found; stopping review loop"
        cat autoresearch/whiteboard-blocked.md
        rm -f autoresearch/whiteboard-blocked.md autoresearch/whiteboard-review.md
        break
      fi
      if [[ $round -eq "$AUTORESEARCH_REVIEW_MAX_ROUNDS" ]]; then
        echo "max review rounds reached; proceeding with what we have"
        rm -f autoresearch/whiteboard-review.md
      fi
    done
  fi

  if ! bash autoresearch/gate.sh; then
    echo "WARN: gate red at end of batch; flagging but continuing to push policy below"
  fi

  if [[ "$AUTORESEARCH_PUSH" == "1" ]]; then
    branch_now="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$branch_now" != "$AUTORESEARCH_BRANCH" ]]; then
      echo "WARN: on ${branch_now}, not ${AUTORESEARCH_BRANCH}; skipping push"
    elif [[ "$AUTORESEARCH_PUSH_MAIN" != "1" && "$branch_now" =~ ^(dev|main|master)$ ]]; then
      echo "ERROR: refusing to push dev/main/master" >&2
    else
      echo "Pushing ${branch_now} to ${AUTORESEARCH_REMOTE}..."
      if git push "$AUTORESEARCH_REMOTE" "HEAD:refs/heads/${branch_now}"; then
        echo "Push ok: $(git rev-parse --short HEAD)"
      else
        echo "WARN: git push failed"
      fi
    fi
  fi

  echo "=== autoresearch cron end $(date -u +%FT%TZ) exit=$final_ec ==="
  exit "$final_ec"
} >>"$LOG" 2>&1
