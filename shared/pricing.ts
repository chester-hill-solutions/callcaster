/**
 * CallCaster Option B rate card (hard cut, no grandfathering).
 * Shared by Remix server modules and Supabase Edge functions.
 */

export const CREDIT_PRICE_CAD = 0.02;
export const MIN_PURCHASE_CAD = 10;
export const MIN_CREDITS = Math.ceil(MIN_PURCHASE_CAD / CREDIT_PRICE_CAD);

export const SMS_SEGMENT_CREDITS = 1;
export const MMS_CREDITS = 2;

export const IVR_FIRST_MINUTE_CREDITS = 2;
export const IVR_ADDITIONAL_MINUTE_CREDITS = 3;

export const STAFFED_FIRST_MINUTE_CREDITS = 4;
export const STAFFED_ADDITIONAL_MINUTE_CREDITS = 5;

/** Monthly rental per number at the Option B peg ($2.00 CAD). */
export const NUMBER_RENTAL_MONTHLY_CREDITS = 100;

export type VoiceBillingKind = "ivr" | "staffed";

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
