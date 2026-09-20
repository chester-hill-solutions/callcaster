#!/bin/sh
# Points this repository at its checked-in git hooks (`.githooks/`), #1897.
#
# Idempotent. Wired via the `prepare` npm script, so `npm install` / `npm ci`
# set it up automatically; also run directly with `npm run setup:githooks`.
#
# Runs under plain POSIX `sh` (no bash, no node): the Docker builds run
# `bun install` in oven/bun images early, before `scripts/` is copied, and the
# `prepare` hook must stay an inert no-op there.
set -e

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "setup-githooks: git not found (CI image?); skipping core.hooksPath" >&2
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "setup-githooks: not a git repository; skipping core.hooksPath" >&2
  exit 0
fi

git config core.hooksPath .githooks
echo "setup-githooks: core.hooksPath -> .githooks"