#!/usr/bin/env bash
# Dev sync listener: keep autoresearch/<tag> rebased on origin/dev and
# force-push with lease so the pilot PR stays fresh as the trunk moves.
#
# Safe to invoke frequently (cron). It shares the batch lock so it never
# rebases under a running batch, and it only force-pushes a head that
# rebased cleanly AND passes typecheck AND check:bun-lock. If any gate
# fails it resets the local branch to the last-known-good remote tip and
# posts a PR comment instead of pushing a broken head.
#
# Usage:
#   bash autoresearch/sync-devd.sh run                 # one sync attempt (cron)
#   bash autoresearch/sync-devd.sh install [--interval 30]   # install cron entry
#   bash autoresearch/sync-devd.sh remove              # remove cron entry
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/autoresearch/cron.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/autoresearch/cron.env"
fi

: "${AUTORESEARCH_TAG:=pilot1}"
: "${AUTORESEARCH_BRANCH:=autoresearch/${AUTORESEARCH_TAG}}"
: "${AUTORESEARCH_REMOTE:=origin}"
: "${AUTORESEARCH_PR_NUMBER:=1706}"
: "${AUTORESEARCH_LOG_DIR:=$ROOT/autoresearch/runs/cron}"
: "${AUTORESEARCH_LOCK:=$ROOT/autoresearch/runs/cron/autoresearch.lock}"

# Cron-friendly toolchain bootstrap (no-op when already on PATH)
export HOME="${HOME:-/home/nathaniel-arfin}"
NVM_BIN="$(ls -d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -V | tail -1)"
export PATH="$HOME/.opencode/bin:$HOME/.bun/bin:$HOME/.local/bin:${NVM_BIN:+$NVM_BIN/bin:}:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$AUTORESEARCH_LOG_DIR"
LOG="$AUTORESEARCH_LOG_DIR/sync-devd.log"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; echo "$(date -u +%FT%TZ)" "$*"; }

install_cron() {
  local interval=30
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --interval) interval="$2"; shift 2 ;;
      *) echo "unknown arg $1" >&2; exit 1 ;;
    esac
  done
  local marker="# AUTORESEARCH-SYNC:${AUTORESEARCH_TAG}"
  local entry="*/${interval} * * * * /bin/bash ${ROOT}/autoresearch/sync-devd.sh run >> ${LOG} 2>&1 ${marker}"
  local existing
  existing="$(crontab -l 2>/dev/null | grep -v "AUTORESEARCH-SYNC:${AUTORESEARCH_TAG}" || true)"
  { [[ -n "$existing" ]] && printf '%s\n' "$existing"; printf '%s\n' "$entry"; } | crontab -
  echo "installed sync cron (every ${interval} min): ${entry}"
}

remove_cron() {
  local existing
  existing="$(crontab -l 2>/dev/null | grep -v "AUTORESEARCH-SYNC:${AUTORESEARCH_TAG}" || true)"
  printf '%s\n' "$existing" | crontab -
  echo "removed sync cron for tag ${AUTORESEARCH_TAG}"
}

run() {
  exec 9>"$AUTORESEARCH_LOCK"
  if ! flock -n 9; then
    log "skip: another run (batch or sync) holds the lock"
    exit 0
  fi

  [[ -d .git ]] || [[ -f .git ]] || { log "ERROR: not a git repo: $ROOT"; exit 1; }

  current="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current" != "$AUTORESEARCH_BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$AUTORESEARCH_BRANCH"; then
      git checkout -q "$AUTORESEARCH_BRANCH"
    else
      git checkout -q -b "$AUTORESEARCH_BRANCH"
    fi
  fi

  # Mirror cron-run.sh: dirt under autoresearch/ is runtime state, anything
  # else means an interrupted turn — never rebase over WIP.
  dirty="$(git status --porcelain | awk '{print $NF}' | grep -vE '^autoresearch/' || true)"
  if [[ -n "$dirty" ]]; then
    log "skip: dirty tree outside autoresearch/ (interrupted turn): $dirty"
    exit 0
  fi

  git fetch -q "$AUTORESEARCH_REMOTE" dev || { log "ERROR: fetch failed"; exit 1; }

  behind="$(git rev-list --count "HEAD..$AUTORESEARCH_REMOTE/dev")"
  if [[ "$behind" == "0" ]]; then
    log "up to date: no new origin/dev commits (HEAD $(git rev-parse --short HEAD))"
    exit 0
  fi

  before="$(git rev-parse --short HEAD)"
  log "rebasing onto origin/dev (${behind} commits behind; HEAD $before)"

  if ! GIT_EDITOR=true git rebase "$AUTORESEARCH_REMOTE/dev"; then
    git rebase --abort 2>/dev/null || true
    log "REBASE CONFLICT on ${AUTORESEARCH_BRANCH}; aborted, remote untouched (HEAD $before)"
    if command -v gh >/dev/null; then
      gh pr comment "$AUTORESEARCH_PR_NUMBER" --body "⚠️ Auto-sync skipped: rebase onto \`origin/dev\` hit a merge conflict. The branch was left at the last-known-good head ($before). Resolve manually in the worktree, then force-push with lease." 2>/dev/null || true
    fi
    exit 1
  fi

  if ! npm run typecheck >/dev/null 2>&1; then
    git reset -q --hard "$AUTORESEARCH_REMOTE/$AUTORESEARCH_BRANCH"
    log "TYPECHECK FAILED after rebase; reset to last-good remote ($before), remote untouched"
    if command -v gh >/dev/null; then
      gh pr comment "$AUTORESEARCH_PR_NUMBER" --body "⚠️ Auto-sync skipped: the rebased tree fails \`npm run typecheck\`. The branch was reset to the last-known-good head ($before). Fix the type errors in the worktree, then force-push with lease." 2>/dev/null || true
    fi
    exit 1
  fi

  if ! npm run check:bun-lock >/dev/null 2>&1; then
    git reset -q --hard "$AUTORESEARCH_REMOTE/$AUTORESEARCH_BRANCH"
    log "BUN-LOCK DRIFT after rebase; reset to last-good remote ($before), remote untouched"
    if command -v gh >/dev/null; then
      gh pr comment "$AUTORESEARCH_PR_NUMBER" --body "⚠️ Auto-sync skipped: \`bun.lock\` drifted from \`package.json\` (check:bun-lock failed). The branch was reset to the last-known-good head ($before). Run \`bun install\` and commit \`bun.lock\` with the dependency change, then force-push with lease." 2>/dev/null || true
    fi
    exit 1
  fi

  after="$(git rev-parse --short HEAD)"
  git push --force-with-lease "$AUTORESEARCH_REMOTE" "$AUTORESEARCH_BRANCH" || { log "ERROR: force-push failed; local ahead of remote (HEAD $after)"; exit 1; }
  log "synced $before -> $after onto origin/dev; force-pushed with lease"
}

case "${1:-run}" in
  run) run ;;
  install) shift; install_cron "$@" ;;
  remove) remove_cron ;;
  *) echo "unknown mode $1 (use run|install|remove)" >&2; exit 1 ;;
esac