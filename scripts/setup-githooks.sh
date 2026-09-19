#!/usr/bin/env bash
# Points this repository at its checked-in git hooks (`.githooks/`), #1897.
#
# Idempotent. Wired via the `prepare` npm script, so `npm install` / `npm ci`
# set it up automatically; also run directly with `npm run setup:githooks`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "setup-githooks: not a git repository (CI archive copy?); skipping core.hooksPath" >&2
  exit 0
fi

git config core.hooksPath .githooks
echo "setup-githooks: core.hooksPath -> .githooks"