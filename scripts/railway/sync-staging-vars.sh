#!/usr/bin/env bash
# Copy dev's service variables into the staging environment (#1300 phase 2).
#
# Staging mirrors production with dev's values (Stripe keys in dev are already
# test-mode; Twilio is the shared account). Three variables are NOT copied
# verbatim:
#   - DATABASE_URL          -> Railway reference to staging's own Postgres
#   - BASE_URL              -> the staging app URL (argument)
#   - BETTER_AUTH_URL       -> the staging app URL (argument)
# DISABLE_2FA_ENFORCEMENT is dev-only and never copied.
#
# Usage:
#   scripts/railway/sync-staging-vars.sh https://<staging-app-domain>
#
# Requires: railway CLI authenticated with account scope, jq.
set -euo pipefail

STAGING_URL="${1:?usage: sync-staging-vars.sh <staging base url, e.g. https://staging.callcaster.ca>}"

PROJECT_ID="32b36c6c-5f3d-463b-8c7f-bbcd70351e8f"
APP_SERVICE_ID="d7a21d02-a448-4970-9989-ab2a7a2589ee"        # CallCaster
WORKER_SERVICE_ID="9cba9fa7-f3d4-47d8-92a9-7317cea681bf"     # callcaster-worker
DB_REFERENCE='${{Postgres-mgzk.DATABASE_URL}}'

APP_COPY_VARS=(
  BETTER_AUTH_SECRET COHERE_API_KEY ELEVENLABS_API_KEY HOST NODE_ENV PORT
  RESEND_API_KEY RUN_CLIENT_MIGRATIONS_ON_BOOT
  S3_ACCESS_KEY_ID S3_BUCKET S3_ENDPOINT S3_REGION S3_SECRET_ACCESS_KEY
  SIGNUP_OPEN STRIPE_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
  TWILIO_API_KEY TWILIO_API_SECRET TWILIO_APP_SID TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER TWILIO_SID
)
WORKER_COPY_VARS=(
  BETTER_AUTH_SECRET NODE_ENV RAILWAY_DOCKERFILE_PATH RESEND_API_KEY
  S3_ACCESS_KEY_ID S3_BUCKET S3_ENDPOINT S3_REGION S3_SECRET_ACCESS_KEY
  STRIPE_SECRET_KEY TWILIO_APP_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER
  TWILIO_SID
)

sync_service() {
  local service_id="$1"; shift
  local -a names=("$@")

  local dev_json
  dev_json=$(railway variable list --service "$service_id" --environment dev --json)

  local name value
  for name in "${names[@]}"; do
    value=$(jq -r --arg k "$name" '.[$k] // empty' <<<"$dev_json")
    if [[ -z "$value" ]]; then
      echo "!! $name is unset in dev — skipped (set it manually if staging needs it)" >&2
      continue
    fi
    railway variable set "$name=$value" --service "$service_id" --environment staging --skip-deploys >/dev/null
    echo "   $name"
  done
}

echo "== CallCaster (app) =="
sync_service "$APP_SERVICE_ID" "${APP_COPY_VARS[@]}"
railway variable set "DATABASE_URL=$DB_REFERENCE" --service "$APP_SERVICE_ID" --environment staging --skip-deploys >/dev/null
railway variable set "BASE_URL=$STAGING_URL" --service "$APP_SERVICE_ID" --environment staging --skip-deploys >/dev/null
railway variable set "BETTER_AUTH_URL=$STAGING_URL" --service "$APP_SERVICE_ID" --environment staging --skip-deploys >/dev/null
echo "   DATABASE_URL (reference), BASE_URL, BETTER_AUTH_URL (staging URL)"

echo "== callcaster-worker =="
sync_service "$WORKER_SERVICE_ID" "${WORKER_COPY_VARS[@]}"
railway variable set "DATABASE_URL=$DB_REFERENCE" --service "$WORKER_SERVICE_ID" --environment staging --skip-deploys >/dev/null
railway variable set "BASE_URL=$STAGING_URL" --service "$WORKER_SERVICE_ID" --environment staging --skip-deploys >/dev/null
echo "   DATABASE_URL (reference), BASE_URL (staging URL)"

echo "Done. Redeploy staging services to pick up the variables."
