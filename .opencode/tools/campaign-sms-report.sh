#!/usr/bin/env bash
#
# Generate the SMS campaign report (issue #1752 "Lee Fairclough" format) for one
# message campaign against the LINKED Railway Postgres. Read-only.
#
# Usage:
#   .opencode/tools/campaign-sms-report.sh <campaignId> [--outdir DIR] [--repo DIR] [--since ISO]
#
# Link the target environment/service first, e.g.:
#   railway environment production && railway service "Postgres-jAO4"
# Restore the link afterwards.
#
# Outputs (in --repo, default cwd):
#   campaign-<id>-all-messages.csv, -opt-outs.csv, -reply-breakdown.csv
# and the report markdown in --outdir (default /tmp/opencode):
#   campaign-<id>-report.md   -> convert to PDF with: python3 /tmp/opencode/md2pdf.py <md> <pdf>
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <campaignId> [--outdir DIR] [--repo DIR] [--since ISO]" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"

railway run -- bash -lc 'DATABASE_URL="$DATABASE_PUBLIC_URL" node .opencode/tools/campaign-sms-report.mjs "$@"' _ "$@"
