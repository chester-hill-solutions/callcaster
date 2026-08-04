/** @typedef {import("./required-env-keys.ts").RequiredEnvKey} RequiredEnvKey */

const OBJECT_STORAGE_GROUPS = [
  [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ],
  ["ENDPOINT", "REGION", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "BUCKET"],
  [
    "AWS_ENDPOINT_URL",
    "AWS_DEFAULT_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET_NAME",
  ],
];

/** @param {NodeJS.ProcessEnv} env */
function hasObjectStorageEnv(env) {
  return OBJECT_STORAGE_GROUPS.some((group) =>
    group.every((key) => Boolean(env[key])),
  );
}

/** @param {NodeJS.ProcessEnv} env */
function validateObjectStorageEnv(env) {
  if (hasObjectStorageEnv(env)) {
    return;
  }

  throw new Error(
    "Missing object storage environment variables. Provide either S3_* " +
      "(local MinIO) or Railway bucket credentials " +
      "(ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET).",
  );
}

export const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
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

  validateObjectStorageEnv(env);
}
