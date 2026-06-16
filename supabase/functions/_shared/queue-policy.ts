/** Queue claim/retry policy — keep in sync with SQL migration comments. */
export const MAX_QUEUE_ATTEMPTS = 5;
export const STALE_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
export const DISPATCH_TICK_MS = 1000;
export const LEGACY_QUEUE_DELAY_MS = 200;

/** Twilio provider retries within a single handler invocation. */
export const PROVIDER_MAX_ATTEMPTS = 3;
export const PROVIDER_BASE_DELAY_MS = 250;

export type RequeueResult =
  | "requeued"
  | "failed_max_attempts"
  | "not_found";

export type HandlerOutcome =
  | "success"
  | "skipped"
  | "retryable_failure"
  | "permanent_failure";
