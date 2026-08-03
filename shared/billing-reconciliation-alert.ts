import type { BillingReconciliationSnapshot } from "./billing-reconciliation";

export type BillingReconciliationDriftMarker = {
  alertedAt: string;
  periodStart: string;
  periodEnd: string;
  smsVariance: number;
  voiceVariance: number;
  messageGap: number;
  callGap: number;
};

export function getBillingReconciliationDriftMarker(
  twilioData: Record<string, unknown> | null | undefined,
): BillingReconciliationDriftMarker | null {
  if (!twilioData || typeof twilioData !== "object") {
    return null;
  }
  const marker = twilioData.billingReconciliationDriftAlert;
  if (!marker || typeof marker !== "object") {
    return null;
  }
  const record = marker as Record<string, unknown>;
  const alertedAt =
    typeof record.alertedAt === "string" ? record.alertedAt : null;
  const periodStart =
    typeof record.periodStart === "string" ? record.periodStart : null;
  const periodEnd = typeof record.periodEnd === "string" ? record.periodEnd : null;
  if (!alertedAt || !periodStart || !periodEnd) {
    return null;
  }
  return {
    alertedAt,
    periodStart,
    periodEnd,
    smsVariance: typeof record.smsVariance === "number" ? record.smsVariance : 0,
    voiceVariance:
      typeof record.voiceVariance === "number" ? record.voiceVariance : 0,
    messageGap: typeof record.messageGap === "number" ? record.messageGap : 0,
    callGap: typeof record.callGap === "number" ? record.callGap : 0,
  };
}

/**
 * Send on the transition into drift, and not again until it clears.
 *
 * This used to compare the marker's period against the snapshot's. The period
 * is a rolling 30 days ending today, so both dates changed every single day and
 * the guard never suppressed anything — every affected workspace received an
 * internal-metrics email daily, forever. Presence-based dedupe, cleared on
 * recovery, is the pattern `runLowCreditNotify` already uses.
 */
export function shouldSendBillingReconciliationDriftEmail(args: {
  snapshot: BillingReconciliationSnapshot;
  marker: BillingReconciliationDriftMarker | null;
}): boolean {
  if (!args.snapshot.materialVariance) {
    return false;
  }
  // Clearing is already handled by the caller, which passes
  // `cleared: !snapshot.materialVariance` into handleBillingReconciliationDrift
  // and drops the marker there. Only the send side was wrong.
  return args.marker === null;
}
