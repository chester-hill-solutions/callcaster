/**
 * Idempotency-key builders and bucket classifier for billing ledger entries.
 *
 * Shared by Remix server modules and Postgres Edge functions so that every
 * billing site constructs keys the same way and both the display mapper
 * (`getBillingEventSource`) and the reconciliation mapper
 * (`categorizeLedgerRow`) classify rows through a single `bucketFromIdempotencyKey`.
 */

export type BillingBucket =
  | "sms"
  | "voice"
  | "numbers"
  | "purchase"
  | "ai"
  | "other";

const SMS_PREFIX = "sms:";
const CALL_PREFIX = "call:";
const NUMBER_RENT_PREFIX = "number_rent:";
const NUMBER_RENT_PURCHASE_PREFIX = "number_rent_purchase:";
const STRIPE_EVT_PREFIX = "stripe_evt:";
const STRIPE_SESSION_PREFIX = "stripe_session:";
const WELCOME_CREDITS_PREFIX = "welcome-credits:";
const TRANSCRIPTION_PREFIX = "transcription:";
const TRANSCRIPTION_BATCH_PREFIX = "transcription_batch:";
const COACHING_PREFIX = "coaching:";

export function smsKey(sid: string): string {
  return `${SMS_PREFIX}${sid}`;
}

/**
 * Voice idempotency key. Keyed on the immutable CallSid ALONE — never on the
 * billing kind. Twilio delivers terminal status callbacks at-least-once, and
 * the derived kind (ivr vs staffed) can differ between deliveries when the
 * campaign-type lookup transiently fails and falls back to the default. If the
 * kind were part of the key, those two deliveries would hash to different keys
 * and BOTH debit the same call. One call → one key → one charge.
 */
export function callKey(sid: string): string {
  return `${CALL_PREFIX}${sid}`;
}

/**
 * Pre-2026-07 voice keys embedded the billing kind (`call:<sid>:ivr` /
 * `call:<sid>:staffed`). Reconciliation lookups over historical rows must still
 * match those; new writes use {@link callKey}.
 */
export function legacyCallKeys(sid: string): string[] {
  return [`${CALL_PREFIX}${sid}:ivr`, `${CALL_PREFIX}${sid}:staffed`];
}

export function numberRentalPurchaseKey(workspaceId: string, numberSid: string): string {
  return `${NUMBER_RENT_PURCHASE_PREFIX}${workspaceId}:${numberSid}`;
}

export function numberRentalCycleKey(numberId: number, cycleKey: string): string {
  return `${NUMBER_RENT_PREFIX}${numberId}:${cycleKey}`;
}

export function stripeSessionKey(sessionId: string): string {
  return `${STRIPE_SESSION_PREFIX}${sessionId}`;
}

export function stripeEventKey(eventId: string): string {
  return `${STRIPE_EVT_PREFIX}${eventId}`;
}

/** One-time welcome grant on workspace creation (CREDIT, not a purchase). */
export function welcomeCreditsKey(workspaceId: string): string {
  return `${WELCOME_CREDITS_PREFIX}${workspaceId}`;
}

/**
 * Realtime (live) speech-to-text for one call. Keyed on CallSid alone: one
 * media stream per call, billed once from the STT clock on stream stop.
 */
export function liveTranscriptionKey(callSid: string): string {
  return `${TRANSCRIPTION_PREFIX}${callSid}`;
}

/**
 * Post-call batch transcription of the recording. Distinct namespace from
 * {@link liveTranscriptionKey} — a call may be both live- and batch-transcribed,
 * and the two are separate vendor charges.
 */
export function batchTranscriptionKey(callSid: string): string {
  return `${TRANSCRIPTION_BATCH_PREFIX}${callSid}`;
}

/**
 * One LLM-generated coaching cue. Keyed by the persisted `coaching_event` row id
 * so each cue is charged exactly once; rule-based cues are not billed.
 */
export function coachingCueKey(callSid: string, eventId: string): string {
  return `${COACHING_PREFIX}${callSid}:${eventId}`;
}

/**
 * Classify a ledger row into a billing bucket from its idempotency key prefix.
 * Consumed by both `getBillingEventSource` (app display) and
 * `categorizeLedgerRow` (shared reconciliation) so the two mappers no longer
 * diverge on bucket names.
 */
export function bucketFromIdempotencyKey(
  idempotencyKey: string | null | undefined,
): BillingBucket {
  const key = idempotencyKey?.trim() ?? "";
  if (key.startsWith(SMS_PREFIX)) return "sms";
  if (key.startsWith(CALL_PREFIX)) return "voice";
  if (key.startsWith(NUMBER_RENT_PREFIX) || key.startsWith(NUMBER_RENT_PURCHASE_PREFIX)) {
    return "numbers";
  }
  if (key.startsWith(STRIPE_EVT_PREFIX) || key.startsWith(STRIPE_SESSION_PREFIX)) {
    return "purchase";
  }
  // AI vendor pass-through (ElevenLabs STT, Cohere cues). Deliberately NOT
  // "voice": the voice bucket is reconciled unit-for-unit against Twilio
  // call minutes, and these charges have no Twilio usage record behind them.
  if (
    key.startsWith(TRANSCRIPTION_PREFIX) ||
    key.startsWith(TRANSCRIPTION_BATCH_PREFIX) ||
    key.startsWith(COACHING_PREFIX)
  ) {
    return "ai";
  }
  return "other";
}
