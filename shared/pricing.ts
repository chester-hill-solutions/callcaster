/**
 * CallCaster Option B rate card (hard cut, no grandfathering).
 * Shared by Remix server modules and Postgres Edge functions.
 */

import { estimateSegments, type SmsEncoding } from "../app/lib/sms-segments";

export const CREDIT_PRICE_CAD = 0.02;
export const MIN_PURCHASE_CAD = 10;
export const MIN_CREDITS = Math.ceil(MIN_PURCHASE_CAD / CREDIT_PRICE_CAD);

export const SMS_SEGMENT_CREDITS = 1;
export const MMS_CREDITS = 2;

export type MessageCreditEstimate = {
  /** Estimated credits this message will be billed. */
  credits: number;
  /** Text segment count the estimate is based on (0 for an empty MMS body). */
  segments: number;
  encoding: SmsEncoding;
  isMms: boolean;
};

/**
 * Client-facing credit estimate for an outbound SMS/MMS message.
 *
 * Mirrors the real billing branch in
 * app/routes/api+/sms/status.action.server.ts EXACTLY:
 *   const amount = isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * numSegments;
 * i.e. MMS is a flat MMS_CREDITS regardless of body length or segment count;
 * SMS is SMS_SEGMENT_CREDITS per segment. Kept next to the SMS_SEGMENT_CREDITS
 * / MMS_CREDITS constants above on purpose — if the rate card changes, this
 * estimate changes with it. If you ever find this drifting from the actual
 * billing branch, fix the branch/this function to match each other; never
 * let the UI estimate diverge from what gets debited.
 */
export function estimateMessageCredits({
  body,
  hasMedia,
}: {
  body: string;
  hasMedia: boolean;
}): MessageCreditEstimate {
  const { segments, encoding } = estimateSegments(body);

  if (hasMedia) {
    return { credits: MMS_CREDITS, segments, encoding, isMms: true };
  }

  return {
    credits: segments * SMS_SEGMENT_CREDITS,
    segments,
    encoding,
    isMms: false,
  };
}

export const IVR_FIRST_MINUTE_CREDITS = 2;
export const IVR_ADDITIONAL_MINUTE_CREDITS = 3;

export const STAFFED_FIRST_MINUTE_CREDITS = 4;
export const STAFFED_ADDITIONAL_MINUTE_CREDITS = 5;

/** Monthly rental per number at the Option B peg ($2.00 CAD). */
export const NUMBER_RENTAL_MONTHLY_CREDITS = 100;

/**
 * Balance floor that triggers low-credit warnings (banner + email).
 * Pegged to one month of number rental so a workspace is warned before
 * it can no longer afford to keep a rented number.
 */
export const LOW_CREDIT_THRESHOLD = NUMBER_RENTAL_MONTHLY_CREDITS;

export type VoiceBillingKind = "ivr" | "staffed";

/**
 * Terminal call statuses that trigger a per-minute debit.
 * Canonical set — reconciliation must use the same set as the debit gate.
 *
 * The actual debit gate also requires a non-zero duration so that
 * failed/busy/no-answer calls (which never connect and therefore have no
 * billable duration) are not charged for staffed or IVR calls.
 */
export const TERMINAL_BILLABLE_CALL_STATUSES = [
  "completed",
  "failed",
  "no-answer",
  "busy",
] as const;

/**
 * Terminal SMS statuses that trigger a per-segment debit.
 * Canonical set — reconciliation must use the same set as the debit gate.
 */
export const TERMINAL_BILLABLE_SMS_STATUSES = [
  "delivered",
  "failed",
  "undelivered",
] as const;

const IVR_CAMPAIGN_TYPES = new Set([
  "robocall",
  "simple_ivr",
  "complex_ivr",
]);

export function voiceBillingKindFromCampaignType(
  type: string | null | undefined,
): VoiceBillingKind {
  if (type && IVR_CAMPAIGN_TYPES.has(type)) {
    return "ivr";
  }
  return "staffed";
}

export function startedMinutesFromDurationSeconds(durationSeconds: number): number {
  const seconds = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
  return Math.max(1, Math.ceil(seconds / 60));
}

export function voiceCreditsFromDurationSeconds(
  durationSeconds: number,
  kind: VoiceBillingKind,
): number {
  const startedMinutes = startedMinutesFromDurationSeconds(durationSeconds);
  const firstMinuteCredits =
    kind === "ivr" ? IVR_FIRST_MINUTE_CREDITS : STAFFED_FIRST_MINUTE_CREDITS;
  const additionalMinuteCredits =
    kind === "ivr"
      ? IVR_ADDITIONAL_MINUTE_CREDITS
      : STAFFED_ADDITIONAL_MINUTE_CREDITS;
  return (
    firstMinuteCredits +
    Math.max(0, startedMinutes - 1) * additionalMinuteCredits
  );
}

/** Negative ledger amount for a credit debit. */
export function debitAmountFromCredits(credits: number): number {
  return -Math.abs(credits);
}

export function formatCadFromCredits(credits: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(credits * CREDIT_PRICE_CAD);
}

/**
 * Human-readable "N credit" / "N credits" — used on the public pricing page
 * so all rates read in the same unit customers actually pay in
 * (the CAD equivalent stays available via `formatCadFromCredits`). #1392.
 *
 * Named to avoid a collision with `app/lib/billing-format.ts::formatCredits`,
 * which just returns `n.toLocaleString()` (its callers append " credits"
 * themselves).
 */
export function formatCreditLabel(credits: number): string {
  const rounded = Number.isInteger(credits) ? credits : Math.round(credits * 100) / 100;
  return `${rounded} ${rounded === 1 ? "credit" : "credits"}`;
}
