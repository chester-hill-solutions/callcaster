/**
 * Idempotency-key builders and bucket classifier for billing ledger entries.
 *
 * Shared by Remix server modules and Postgres Edge functions so that every
 * billing site constructs keys the same way and both the display mapper
 * (`getBillingEventSource`) and the reconciliation mapper
 * (`categorizeLedgerRow`) classify rows through a single `bucketFromIdempotencyKey`.
 */

export type BillingBucket = "sms" | "voice" | "numbers" | "purchase" | "other";

const SMS_PREFIX = "sms:";
const CALL_PREFIX = "call:";
const NUMBER_RENT_PREFIX = "number_rent:";
const NUMBER_RENT_PURCHASE_PREFIX = "number_rent_purchase:";
const STRIPE_EVT_PREFIX = "stripe_evt:";
const STRIPE_SESSION_PREFIX = "stripe_session:";

export function smsKey(sid: string): string {
  return `${SMS_PREFIX}${sid}`;
}

export function callKey(sid: string, kind: string): string {
  return `${CALL_PREFIX}${sid}:${kind}`;
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
  return "other";
}
