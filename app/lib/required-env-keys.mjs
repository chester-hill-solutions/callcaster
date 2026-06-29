/** @typedef {import("./required-env-keys.ts").RequiredEnvKey} RequiredEnvKey */

export const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "BASE_URL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
];

/** @param {NodeJS.ProcessEnv} [env] */
export function validateRequiredEnv(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
