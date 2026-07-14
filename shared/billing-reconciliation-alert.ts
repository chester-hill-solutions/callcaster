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

export function shouldSendBillingReconciliationDriftEmail(args: {
  snapshot: BillingReconciliationSnapshot;
  marker: BillingReconciliationDriftMarker | null;
}): boolean {
  if (!args.snapshot.materialVariance) {
    return false;
  }
  if (!args.marker) {
    return true;
  }
  return (
    args.marker.periodStart !== args.snapshot.period.startDate ||
    args.marker.periodEnd !== args.snapshot.period.endDate
  );
}
