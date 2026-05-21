/**
 * Environment variable validation and access utilities
 * 
 * This module provides type-safe access to environment variables
 * and validates required variables at application startup.
 */

type EnvConfig = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_PUBLISHABLE_KEY: string;
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

const requiredEnvVars: (keyof EnvConfig)[] = [...REQUIRED_ENV_KEYS];

const optionalEnvVars: (keyof EnvConfig)[] = [
  'OPENAI_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_VALIDATE_WEBHOOKS',
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
    console.error('Environment validation error:', error);
  }
}

/**
 * Type-safe environment variable accessor
 * Use this instead of directly accessing process.env
 */
export const env = {
  SUPABASE_URL: () => getEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: () => getEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_KEY: () => getEnv('SUPABASE_SERVICE_KEY'),
  SUPABASE_PUBLISHABLE_KEY: () => getEnv('SUPABASE_PUBLISHABLE_KEY'),
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

