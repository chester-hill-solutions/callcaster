/**
 * Environment variable validation and access utilities
 * 
 * This module provides type-safe access to environment variables
 * and validates required variables at application startup.
 */

type EnvConfig = {
  DATABASE_URL: string;
  DATABASE_DIRECT_URL?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  /** Single-bucket mode: logical buckets use `{bucketName}/{objectPath}` keys. */
  S3_BUCKET: string;
  /** Optional dedicated buckets (override S3_BUCKET prefix layout). */
  S3_BUCKET_AUDIO?: string;
  S3_BUCKET_MEDIA?: string;
  S3_BUCKET_EXPORTS?: string;
  TWILIO_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_APP_SID: string;
  TWILIO_PHONE_NUMBER: string;
  BASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY: string;
  OPENAI_API_KEY?: string;
  VERIFICATION_PHONE_NUMBER?: string;
  TWILIO_VALIDATE_WEBHOOKS?: string;
};

import { REQUIRED_ENV_KEYS, validateRequiredEnv } from "./required-env-keys";

const requiredEnvVars = [...REQUIRED_ENV_KEYS] as (keyof EnvConfig)[];

const optionalEnvVars: (keyof EnvConfig)[] = [
  'OPENAI_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_VALIDATE_WEBHOOKS',
  'DATABASE_DIRECT_URL',
  'BETTER_AUTH_URL',
  'S3_BUCKET_AUDIO',
  'S3_BUCKET_MEDIA',
  'S3_BUCKET_EXPORTS',
];

/**
 * Validates that all required environment variables are present
 * @throws Error if any required environment variable is missing
 */
function validateEnv(): void {
  validateRequiredEnv(process.env);
}

/**
 * Gets an environment variable value
 * @param key - The environment variable key
 * @returns The environment variable value
 * @throws Error if required variable is missing
 */
function getEnv<K extends keyof EnvConfig>(
  key: K
): EnvConfig[K] {
  const value = process.env[key] as EnvConfig[K] | undefined;

  if (value) {
    return value;
  }

  if (optionalEnvVars.includes(key)) {
    return undefined as EnvConfig[K];
  }

  throw new Error(
    `Missing required environment variable: ${key}\n` +
    'Please check your .env file or environment configuration.'
  );
}

// Validate environment variables on module load
// This will throw an error immediately if required vars are missing
if (typeof window === 'undefined') {
  // Only validate on server-side
  try {
    validateEnv();
  } catch (error) {
    // Log error but don't throw during module load to allow graceful handling
    if (process.env.NODE_ENV !== 'test') {
      console.error('Environment validation error:', error);
    }
  }
}

/**
 * Type-safe environment variable accessor
 * Use this instead of directly accessing process.env
 */
export const env = {
  DATABASE_URL: () => getEnv('DATABASE_URL'),
  DATABASE_DIRECT_URL: () => getEnv('DATABASE_DIRECT_URL'),
  BETTER_AUTH_SECRET: () => getEnv('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: () => getEnv('BETTER_AUTH_URL') ?? getEnv('BASE_URL'),
  S3_ENDPOINT: () => getEnv('S3_ENDPOINT'),
  S3_REGION: () => getEnv('S3_REGION'),
  S3_ACCESS_KEY_ID: () => getEnv('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: () => getEnv('S3_SECRET_ACCESS_KEY'),
  S3_BUCKET: () => getEnv('S3_BUCKET'),
  S3_BUCKET_AUDIO: () => getEnv('S3_BUCKET_AUDIO'),
  S3_BUCKET_MEDIA: () => getEnv('S3_BUCKET_MEDIA'),
  S3_BUCKET_EXPORTS: () => getEnv('S3_BUCKET_EXPORTS'),
  TWILIO_SID: () => getEnv('TWILIO_SID'),
  TWILIO_AUTH_TOKEN: () => getEnv('TWILIO_AUTH_TOKEN'),
  TWILIO_APP_SID: () => getEnv('TWILIO_APP_SID'),
  TWILIO_PHONE_NUMBER: () => getEnv('TWILIO_PHONE_NUMBER'),
  BASE_URL: () => getEnv('BASE_URL'),
  STRIPE_SECRET_KEY: () => getEnv('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: () => getEnv('STRIPE_WEBHOOK_SECRET'),
  RESEND_API_KEY: () => getEnv('RESEND_API_KEY'),
  OPENAI_API_KEY: () => getEnv('OPENAI_API_KEY'),
  VERIFICATION_PHONE_NUMBER: () => getEnv('VERIFICATION_PHONE_NUMBER'),
  /** When `false` or `0`, Remix Twilio webhooks skip signature checks (local dev only). */
  TWILIO_VALIDATE_WEBHOOKS: () => getEnv('TWILIO_VALIDATE_WEBHOOKS'),
} as const;

/**
 * Re-validate environment variables (useful for testing or runtime checks)
 */
export function revalidateEnv(): void {
  validateEnv();
}

export { validateRequiredEnv, REQUIRED_ENV_KEYS };

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
