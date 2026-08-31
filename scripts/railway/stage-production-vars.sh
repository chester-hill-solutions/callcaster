#!/usr/bin/env bash
# Pre-stage production's v2 variables ahead of the cutover (#1300 / #1303).
#
# Everything is set with --skip-deploys: the RUNNING Supabase-era app keeps
# its baked environment untouched; the cutover deployment (first build after
# v2 is promoted to the `production` branch) inherits these automatically.
#
# Reference variables wherever possible (same pattern as dev/staging):
#   DATABASE_URL -> ${{Postgres-jAO4.DATABASE_URL}}
#   app URLs     -> https://${{RAILWAY_PUBLIC_DOMAIN}}   (renders callcaster.ca)
#   worker URL   -> https://${{callcaster.RAILWAY_PUBLIC_DOMAIN}}
#   S3_*         -> ${{callcaster-production.*}}
# Literals only for real secrets:
#   - BETTER_AUTH_SECRET is generated fresh here and shared app<->worker
#   - RESEND/STRIPE/TWILIO are taken from production's own existing values
#   - COHERE/ELEVENLABS + HOST/PORT/SIGNUP_OPEN are copied from dev (shared
#     vendor keys / non-secret runtime config)
# SUPABASE_* / DATABASE_DIRECT_URL / OPENAI_API_KEY are left in place for the
# still-running app; they are deleted post-soak, not here.
#
# NOTE (found 2026-08-18): production's existing STRIPE keys are sk_test_ —
# production has been on Stripe TEST MODE all along. Going live-mode is a
# separate business decision; this script intentionally keeps what exists.
#
# Usage: scripts/railway/stage-production-vars.sh
set -euo pipefail

APP_ID="6a2f20d9-ac0f-4e6f-a180-c8d13e0d34d2"        # callcaster (production app)
WORKER_ID="9cba9fa7-f3d4-47d8-92a9-7317cea681bf"     # callcaster-worker
DEV_APP_ID="d7a21d02-a448-4970-9989-ab2a7a2589ee"    # CallCaster (dev app)

D=$(railway variable list --service "$DEV_APP_ID" --environment dev --json)
P=$(railway variable list --service "$APP_ID" --environment production --json)
SECRET=$(openssl rand -hex 32)

need() { jq -r --arg k "$1" '.[$k] // empty' <<<"$2"; }
HOST=$(need HOST "$D"); PORT=$(need PORT "$D"); SIGNUP=$(need SIGNUP_OPEN "$D")
COHERE=$(need COHERE_API_KEY "$D"); ELEVEN=$(need ELEVENLABS_API_KEY "$D")
RESEND=$(need RESEND_API_KEY "$P"); STRIPE_SK=$(need STRIPE_SECRET_KEY "$P")
T_APP=$(need TWILIO_APP_SID "$P"); T_AUTH=$(need TWILIO_AUTH_TOKEN "$P")
T_PHONE=$(need TWILIO_PHONE_NUMBER "$P"); T_SID=$(need TWILIO_SID "$P")
[ -n "$HOST" ] && [ -n "$RESEND" ] || { echo "source variable fetch failed" >&2; exit 1; }

echo "== staging vars on production app (skip-deploys) =="
railway variable set \
  'DATABASE_URL=${{Postgres-jAO4.DATABASE_URL}}' \
  'BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}' \
  'BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}' \
  "BETTER_AUTH_SECRET=$SECRET" \
  'NODE_ENV=production' \
  "HOST=$HOST" "PORT=$PORT" \
  'RUN_CLIENT_MIGRATIONS_ON_BOOT=true' \
  "SIGNUP_OPEN=$SIGNUP" \
  "COHERE_API_KEY=$COHERE" "ELEVENLABS_API_KEY=$ELEVEN" \
  'S3_ENDPOINT=${{callcaster-production.ENDPOINT}}' \
  'S3_ACCESS_KEY_ID=${{callcaster-production.ACCESS_KEY_ID}}' \
  'S3_SECRET_ACCESS_KEY=${{callcaster-production.SECRET_ACCESS_KEY}}' \
  'S3_REGION=${{callcaster-production.REGION}}' \
  'S3_BUCKET=${{callcaster-production.BUCKET}}' \
  --service "$APP_ID" --environment production --skip-deploys >/dev/null
echo "   done"

echo "== staging vars on production worker (skip-deploys) =="
railway variable set \
  'DATABASE_URL=${{Postgres-jAO4.DATABASE_URL}}' \
  'BASE_URL=https://${{callcaster.RAILWAY_PUBLIC_DOMAIN}}' \
  "BETTER_AUTH_SECRET=$SECRET" \
  'NODE_ENV=production' \
  'RAILWAY_DOCKERFILE_PATH=Dockerfile.worker' \
  "RESEND_API_KEY=$RESEND" "STRIPE_SECRET_KEY=$STRIPE_SK" \
  "TWILIO_APP_SID=$T_APP" "TWILIO_AUTH_TOKEN=$T_AUTH" \
  "TWILIO_PHONE_NUMBER=$T_PHONE" "TWILIO_SID=$T_SID" \
  'S3_ENDPOINT=${{callcaster-production.ENDPOINT}}' \
  'S3_ACCESS_KEY_ID=${{callcaster-production.ACCESS_KEY_ID}}' \
  'S3_SECRET_ACCESS_KEY=${{callcaster-production.SECRET_ACCESS_KEY}}' \
  'S3_REGION=${{callcaster-production.REGION}}' \
  'S3_BUCKET=${{callcaster-production.BUCKET}}' \
  --service "$WORKER_ID" --environment production --skip-deploys >/dev/null
echo "   done"

echo "== verification (rendered, no secrets printed) =="
for pair in "app:$APP_ID" "worker:$WORKER_ID"; do
  name="${pair%%:*}"; id="${pair#*:}"
  railway variable list --service "$id" --environment production --json | python3 -c "
import json,sys
v=json.load(sys.stdin)
checks={'DATABASE_URL':v.get('DATABASE_URL'),'BASE_URL':v.get('BASE_URL'),
        'S3_ENDPOINT':v.get('S3_ENDPOINT'),'S3_BUCKET':v.get('S3_BUCKET'),
        'BETTER_AUTH_SECRET':v.get('BETTER_AUTH_SECRET')}
bad=[k for k,val in checks.items() if not val]
print('$name:', 'ALL RENDER' if not bad else f'EMPTY: {bad}')
print('  BASE_URL =', v.get('BASE_URL'))"
done
echo "Done. No deploys were triggered; the cutover build inherits these."
