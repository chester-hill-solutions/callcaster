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
  RESEND_API_KEY: string;
  OPENAI_API_KEY?: string;
};

const requiredEnvVars: (keyof EnvConfig)[] = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'TWILIO_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_APP_SID',
  'TWILIO_PHONE_NUMBER',
  'BASE_URL',
  'STRIPE_SECRET_KEY',
  'RESEND_API_KEY',
];

const optionalEnvVars: (keyof EnvConfig)[] = [
  'OPENAI_API_KEY',
];

/**
 * Validates that all required environment variables are present
 * @throws Error if any required environment variable is missing
 */
function validateEnv(): void {
  const missing: string[] = [];

  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }
}

/**
 * Gets an environment variable value
 * @param key - The environment variable key
 * @param defaultValue - Optional default value for optional variables
 * @returns The environment variable value
 * @throws Error if required variable is missing
 */
function getEnv<K extends keyof EnvConfig>(
  key: K,
  defaultValue?: EnvConfig[K]
): EnvConfig[K] {
  const value = process.env[key] as EnvConfig[K] | undefined;

  if (value) {
    return value;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
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
  RESEND_API_KEY: () => getEnv('RESEND_API_KEY'),
  OPENAI_API_KEY: () => getEnv('OPENAI_API_KEY', undefined),
} as const;

/**
 * Re-validate environment variables (useful for testing or runtime checks)
 */
export function revalidateEnv(): void {
  validateEnv();
}

