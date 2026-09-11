#!/usr/bin/env bash
# Install or remove the autoresearch cron schedule for a tag.
# Usage:
#   bash autoresearch/install-cron.sh --interval 120      # every 120 min (default)
#   bash autoresearch/install-cron.sh --remove
# Tag comes from autoresearch/cron.env (AUTORESEARCH_TAG) or --tag arg.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f autoresearch/cron.env ]]; then
  # shellcheck disable=SC1091
  source autoresearch/cron.env
fi

INTERVAL=120
ACTION=install
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    --tag) TAG_ARG="$2"; shift 2 ;;
    --remove) ACTION=remove; shift ;;
    *) echo "unknown arg $1" >&2; exit 1 ;;
  esac
done

TAG="${TAG_ARG:-${AUTORESEARCH_TAG:-pilot1}}"
MARKER="# AUTORESEARCH:${TAG}"
ENTRY="*/${INTERVAL} * * * * /bin/bash ${ROOT}/autoresearch/cron-run.sh >> ${ROOT}/autoresearch/runs/cron/crontab.log 2>&1 ${MARKER}"

mkdir -p autoresearch/runs/cron

existing="$(crontab -l 2>/dev/null | grep -v "AUTORESEARCH:${TAG}" || true)"

if [[ "$ACTION" == "remove" ]]; then
  printf '%s\n' "$existing" | crontab -
  echo "removed cron entries for tag ${TAG}"
else
  { [[ -n "$existing" ]] && printf '%s\n' "$existing"; printf '%s\n' "$ENTRY"; } | crontab -
  echo "installed: ${ENTRY}"
fi
