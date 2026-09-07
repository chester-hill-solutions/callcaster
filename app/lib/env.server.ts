/**
 * Environment variable validation and access utilities
 * 
 * This module provides type-safe access to environment variables
 * and validates required variables at application startup.
 */

import { resolveObjectStorageEnvRequired } from "./object-storage-config";

type EnvConfig = {
  DATABASE_URL: string;
  DATABASE_DIRECT_URL?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  /** S3-compatible endpoint (S3_ENDPOINT locally, ENDPOINT on Railway Buckets). */
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
  /** Ops-alert recipient for Twilio compliance jobs needing docs / failing terminally. Defaults to the platform compliance inbox when unset. */
  TWILIO_COMPLIANCE_NOTIFY_EMAIL?: string;
  /** Trust Hub secondary customer-profile policy SID (override; optional). */
  TWILIO_TRUSTHUB_SECONDARY_POLICY_SID?: string;
  VERIFICATION_PHONE_NUMBER?: string;
  TWILIO_VALIDATE_WEBHOOKS?: string;
  /** Shared secret required on /api/twilio/a2p/events (Event Streams webhook sink). */
  TWILIO_EVENTS_SINK_SECRET?: string;
  /** Enables Twilio Lookup v2 line-type checks before first SMS to a contact. Off by default; costs $0.008/lookup. */
  TWILIO_LOOKUP_ENABLED?: string;
  /** Secret used to sign media-stream WebSocket tokens. */
  MEDIA_STREAM_SECRET?: string;
  /** Public host of the media-stream Bun service (e.g. media-stream-production.up.railway.app). */
  MEDIA_STREAM_HOST?: string;
};

import { REQUIRED_ENV_KEYS, validateRequiredEnv } from "./required-env-keys";

const requiredEnvVars = [...REQUIRED_ENV_KEYS] as (keyof EnvConfig)[];

const optionalEnvVars: (keyof EnvConfig)[] = [
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_VALIDATE_WEBHOOKS',
  'TWILIO_COMPLIANCE_NOTIFY_EMAIL',
  'TWILIO_TRUSTHUB_SECONDARY_POLICY_SID',
  'TWILIO_LOOKUP_ENABLED',
  'TWILIO_EVENTS_SINK_SECRET',
  'DATABASE_DIRECT_URL',
  'BETTER_AUTH_URL',
  'S3_BUCKET_AUDIO',
  'S3_BUCKET_MEDIA',
  'S3_BUCKET_EXPORTS',
  'MEDIA_STREAM_SECRET',
  'MEDIA_STREAM_HOST',
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

/** Stripe secret-key mode, derived from the key prefix (`sk_test_` / `sk_live_`). */
export type StripeKeyMode = 'test' | 'live' | 'unknown';

/** Detects the Stripe key mode from a secret (or restricted) key's prefix. */
export function getStripeKeyMode(
  secretKey: string | null | undefined,
): StripeKeyMode {
  if (!secretKey) return 'unknown';
  if (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')) {
    return 'test';
  }
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
    return 'live';
  }
  return 'unknown';
}

let stripeKeyModeMismatchLogged = false;

/**
 * Guard for issue #1027: production running with a Stripe TEST-mode key sends
 * real users to a test-mode Checkout where every real card is declined
 * ("Your request was in test mode, but used a non test card"). Make that
 * misconfiguration loud at boot instead of a confusing decline at card entry.
 *
 * Logs a prominent structured error once per process. Never throws —
 * production must not go down over this. Returns true when the mismatch is
 * present (NODE_ENV === "production" with a test-mode STRIPE_SECRET_KEY).
 */
export function warnIfStripeKeyModeMismatch(): boolean {
  const keyMode = getStripeKeyMode(process.env.STRIPE_SECRET_KEY);
  const mismatch = process.env.NODE_ENV === 'production' && keyMode === 'test';

  if (mismatch && !stripeKeyModeMismatchLogged) {
    stripeKeyModeMismatchLogged = true;
    console.error(
      'STRIPE MISCONFIGURATION: STRIPE_SECRET_KEY is a TEST-mode key while NODE_ENV is "production"',
      {
        guard: 'stripe-key-mode-mismatch',
        keyMode,
        nodeEnv: process.env.NODE_ENV,
        impact:
          'Stripe Checkout runs in test mode; real cards are declined and credit purchases fail.',
        fix: 'Set STRIPE_SECRET_KEY (and matching STRIPE_WEBHOOK_SECRET) to live-mode values in the production environment.',
      },
    );
  }

  return mismatch;
}

// Validate environment variables on module load
// This will throw an error immediately if required vars are missing
// `!("window" in globalThis)` rather than `typeof window === "undefined"`:
// this module is also pulled in by services/** (the Bun media-stream service),
// which typechecks without the DOM lib, so the bare `window` global is not
// declared there. The runtime semantics are identical.
if (!("window" in globalThis)) {
  // Only validate on server-side
  try {
    validateEnv();
  } catch (error) {
    // Log error but don't throw during module load to allow graceful handling
    if (process.env.NODE_ENV !== 'test') {
      console.error('Environment validation error:', error);
    }
  }
  // Boot-time guard: loud structured error if prod is on a Stripe test key.
  warnIfStripeKeyModeMismatch();
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
  S3_ENDPOINT: () => resolveObjectStorageEnvRequired('endpoint'),
  S3_REGION: () => resolveObjectStorageEnvRequired('region'),
  S3_ACCESS_KEY_ID: () => resolveObjectStorageEnvRequired('accessKeyId'),
  S3_SECRET_ACCESS_KEY: () => resolveObjectStorageEnvRequired('secretAccessKey'),
  S3_BUCKET: () => resolveObjectStorageEnvRequired('bucket'),
  S3_BUCKET_AUDIO: () => getEnv('S3_BUCKET_AUDIO'),
  S3_BUCKET_MEDIA: () => getEnv('S3_BUCKET_MEDIA'),
  S3_BUCKET_EXPORTS: () => getEnv('S3_BUCKET_EXPORTS'),
  TWILIO_SID: () => getEnv('TWILIO_SID'),
  TWILIO_AUTH_TOKEN: () => getEnv('TWILIO_AUTH_TOKEN'),
  TWILIO_APP_SID: () => getEnv('TWILIO_APP_SID'),
  TWILIO_PHONE_NUMBER: () => getEnv('TWILIO_PHONE_NUMBER'),
  // Trailing slash stripped centrally: 23 of 29 call sites string-template
  // Twilio callback URLs from this value, and `https://host//api/...` 404s.
  BASE_URL: () => getEnv('BASE_URL').replace(/\/+$/, ''),
  STRIPE_SECRET_KEY: () => {
    // Re-check at every Stripe-client init (once-logged) in case env vars
    // were injected after module load.
    warnIfStripeKeyModeMismatch();
    return getEnv('STRIPE_SECRET_KEY');
  },
  STRIPE_WEBHOOK_SECRET: () => getEnv('STRIPE_WEBHOOK_SECRET'),
  RESEND_API_KEY: () => getEnv('RESEND_API_KEY'),
  /** Ops-alert recipient for Twilio compliance jobs needing docs / failing terminally. Falls back to the platform compliance inbox. */
  TWILIO_COMPLIANCE_NOTIFY_EMAIL: () =>
    getEnv('TWILIO_COMPLIANCE_NOTIFY_EMAIL') || 'info@callcaster.ca',
  /** Trust Hub secondary customer-profile policy SID override (optional). */
  TWILIO_TRUSTHUB_SECONDARY_POLICY_SID: () =>
    getEnv('TWILIO_TRUSTHUB_SECONDARY_POLICY_SID'),
  VERIFICATION_PHONE_NUMBER: () => getEnv('VERIFICATION_PHONE_NUMBER'),
  /** When `false` or `0`, Remix Twilio webhooks skip signature checks (local dev only). */
  TWILIO_VALIDATE_WEBHOOKS: () => getEnv('TWILIO_VALIDATE_WEBHOOKS'),
  /** When "true" or "1", enables Twilio Lookup v2 line-type checks (see twilio-lookup.server.ts). Off by default. */
  TWILIO_LOOKUP_ENABLED: () => getEnv('TWILIO_LOOKUP_ENABLED'),
  /** Shared secret for the Event Streams sink route; unset = route rejects all requests when validation is on. */
  TWILIO_EVENTS_SINK_SECRET: () => getEnv('TWILIO_EVENTS_SINK_SECRET'),
  /** Secret used to sign media-stream WebSocket tokens. Dev-only fallback; must be set in production. */
  MEDIA_STREAM_SECRET: () => {
    const value = getEnv('MEDIA_STREAM_SECRET');
    if (value) {
      return value;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MEDIA_STREAM_SECRET must be set in production — refusing to sign media-stream tokens with the dev fallback secret.',
      );
    }
    return 'dev-media-stream-secret-change-me';
  },
  /**
   * Public host of the media-stream Bun service.
   *
   * Defaults to localhost:3001 in non-production ONLY. In production an unset
   * value must stay undefined so the fail-closed guard in
   * media-stream-twiml.server.ts fires (logs `media-stream-host-missing` and
   * skips `<Stream>`); defaulting there would instead hand Twilio a
   * `wss://localhost:3001` URL it can never reach — a silently broken
   * `<Stream>` on every call.
   */
  MEDIA_STREAM_HOST: () => {
    const value = getEnv('MEDIA_STREAM_HOST');
    if (value) {
      return value;
    }
    return isProduction() ? undefined : 'localhost:3001';
  },
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

/**
 * Two-factor authentication kill switch. Off unless TWO_FACTOR_ENABLED=true|1:
 * the Better Auth twoFactor plugin is not registered (no code prompt at
 * sign-in, for enrolled users too), and every privileged-role mandate is off.
 * Enrollment rows are kept, so setting the flag turns it all back on.
 */
export function isTwoFactorFeatureEnabled(): boolean {
  const v = process.env.TWO_FACTOR_ENABLED;
  return v === "true" || v === "1";
}

/**
 * The design gallery (`/workspaces/:id/design`) is a workbench for the tone
 * system, scanned by axe in E2E. It is not a customer surface: available in
 * development and the E2E harness, and in production only behind an explicit
 * DESIGN_GALLERY_ENABLED=true|1 (roadmap E3.3).
 */
export function isDesignGalleryEnabled(): boolean {
  const v = process.env.DESIGN_GALLERY_ENABLED;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return !isProduction() || process.env.E2E_TEST === "1";
}

/** Self-service signup is opt-in via SIGNUP_OPEN=true|1 (non-prod deployments). */
export function isSignupOpen(): boolean {
  const v = process.env.SIGNUP_OPEN;
  return v === "true" || v === "1";
}
