/**
 * Secret names from the checked-in Phase 0 configuration catalog.
 *
 * This is a name-only catalog. It must not contain secret values or provider
 * logic. Keep it in sync with entries classified as `secret` in
 * scripts/configuration-inventory/catalog.json.
 */
export const secretNames = [
  "ACCESS_KEY_ID",
  "BETTER_AUTH_SECRET",
  "CLOUDFLARED_CREDENTIALS_FILE",
  "COHERE_API_KEY",
  "CRON_SECRET",
  "DATABASE_DIRECT_URL",
  "DATABASE_PUBLIC_URL",
  "DATABASE_URL",
  "ELEVENLABS_API_KEY",
  "GH_TOKEN",
  "MEDIA_STREAM_SECRET",
  "NODE_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "PGPASSWORD",
  "POSTGRES_PASSWORD",
  "PROJECT_TOKEN",
  "RAILWAY_TOKEN",
  "RESEND_API_KEY",
  "S3_ACCESS_KEY_ID",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_SECRET_ACCESS_KEY",
  "SECRET_ACCESS_KEY",
  "SIM_PERSON_A_PASSWORD",
  "SIM_PERSON_B_PASSWORD",
  "SIM_PERSON_C_PASSWORD",
  "SOURCE_DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TARGET_DATABASE_URL",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_EVENTS_SINK_SECRET",
] as const;
