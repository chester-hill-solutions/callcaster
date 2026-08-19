#!/usr/bin/env bash
# Copy dev's service variables into the staging environment (#1300 phase 2).
#
# Staging mirrors production with dev's values (Stripe keys in dev are already
# test-mode; Twilio is the shared account). Environment-shaped variables are
# set as Railway REFERENCE variables, never literals, so they follow domain
# and service changes automatically:
#   - DATABASE_URL          -> ${{Postgres-mgzk.DATABASE_URL}}
#   - BASE_URL/BETTER_AUTH_URL (app) -> https://${{RAILWAY_PUBLIC_DOMAIN}}
#   - BASE_URL (worker)     -> https://${{CallCaster.RAILWAY_PUBLIC_DOMAIN}}
#   - S3_*                  -> ${{callcaster-staging.*}} bucket references
#     (ENDPOINT / ACCESS_KEY_ID / SECRET_ACCESS_KEY / REGION / BUCKET —
#     BUCKET is the real S3 storage name; RAILWAY_BUCKET_NAME is the label)
# DISABLE_2FA_ENFORCEMENT is dev-only and never copied.
#
# Usage:
#   scripts/railway/sync-staging-vars.sh
#
# Requires: railway CLI authenticated with account scope, jq.
set -euo pipefail

PROJECT_ID="32b36c6c-5f3d-463b-8c7f-bbcd70351e8f"
APP_SERVICE_ID="d7a21d02-a448-4970-9989-ab2a7a2589ee"        # CallCaster
WORKER_SERVICE_ID="9cba9fa7-f3d4-47d8-92a9-7317cea681bf"     # callcaster-worker
DB_REFERENCE='${{Postgres-mgzk.DATABASE_URL}}'
SELF_URL_REFERENCE='https://${{RAILWAY_PUBLIC_DOMAIN}}'
APP_URL_REFERENCE='https://${{CallCaster.RAILWAY_PUBLIC_DOMAIN}}'
BUCKET='callcaster-staging'

APP_COPY_VARS=(
  BETTER_AUTH_SECRET COHERE_API_KEY ELEVENLABS_API_KEY HOST NODE_ENV PORT
  RESEND_API_KEY RUN_CLIENT_MIGRATIONS_ON_BOOT
  SIGNUP_OPEN STRIPE_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
  TWILIO_API_KEY TWILIO_API_SECRET TWILIO_APP_SID TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER TWILIO_SID
)
WORKER_COPY_VARS=(
  BETTER_AUTH_SECRET NODE_ENV RAILWAY_DOCKERFILE_PATH RESEND_API_KEY
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
railway variable set "BASE_URL=$SELF_URL_REFERENCE" --service "$APP_SERVICE_ID" --environment staging --skip-deploys >/dev/null
railway variable set "BETTER_AUTH_URL=$SELF_URL_REFERENCE" --service "$APP_SERVICE_ID" --environment staging --skip-deploys >/dev/null
set_bucket_refs() {
  local svc="$1"
  railway variable set \
    "S3_ENDPOINT=\${{${BUCKET}.ENDPOINT}}" \
    "S3_ACCESS_KEY_ID=\${{${BUCKET}.ACCESS_KEY_ID}}" \
    "S3_SECRET_ACCESS_KEY=\${{${BUCKET}.SECRET_ACCESS_KEY}}" \
    "S3_REGION=\${{${BUCKET}.REGION}}" \
    "S3_BUCKET=\${{${BUCKET}.BUCKET}}" \
    --service "$svc" --environment staging --skip-deploys >/dev/null
}
set_bucket_refs "$APP_SERVICE_ID"
echo "   DATABASE_URL, BASE_URL, BETTER_AUTH_URL, S3_* (references)"

echo "== callcaster-worker =="
sync_service "$WORKER_SERVICE_ID" "${WORKER_COPY_VARS[@]}"
railway variable set "DATABASE_URL=$DB_REFERENCE" --service "$WORKER_SERVICE_ID" --environment staging --skip-deploys >/dev/null
railway variable set "BASE_URL=$APP_URL_REFERENCE" --service "$WORKER_SERVICE_ID" --environment staging --skip-deploys >/dev/null
set_bucket_refs "$WORKER_SERVICE_ID"
echo "   DATABASE_URL, BASE_URL, S3_* (references)"

echo "Done. Redeploy staging services to pick up the variables."
