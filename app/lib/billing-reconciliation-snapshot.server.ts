
import type { Database } from "@/lib/db-types";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { isObject } from "@/lib/type-safety-utils";
import { patchWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import {
  buildBillingReconciliationSnapshot,
  type BillingReconciliationReport,
  type BillingReconciliationSnapshot,
} from "../../shared/billing-reconciliation";

export type { BillingReconciliationSnapshot };

const DEFAULT_SNAPSHOT: BillingReconciliationSnapshot = {
  lastRunAt: "",
  lastRunSource: "admin",
  materialVariance: false,
  period: { startDate: "", endDate: "" },
  smsVariance: 0,
  voiceVariance: 0,
  messageGap: 0,
  callGap: 0,
  unrecognizedDebitEvents: 0,
};

export function normalizeBillingReconciliationSnapshot(
  value: unknown,
): BillingReconciliationSnapshot | null {
  if (!isObject(value)) {
    return null;
  }

  const period = isObject(value.period) ? value.period : null;
  const lastRunAt = parseOptionalString(value.lastRunAt);
  if (!lastRunAt) {
    return null;
  }

  return {
    lastRunAt,
    lastRunSource: value.lastRunSource === "cron" ? "cron" : "admin",
    materialVariance: value.materialVariance === true,
    period: {
      startDate: parseOptionalString(period?.startDate) ?? "",
      endDate: parseOptionalString(period?.endDate) ?? "",
    },
    smsVariance: typeof value.smsVariance === "number" ? value.smsVariance : 0,
    voiceVariance:
      typeof value.voiceVariance === "number" ? value.voiceVariance : 0,
    messageGap: typeof value.messageGap === "number" ? value.messageGap : 0,
    callGap: typeof value.callGap === "number" ? value.callGap : 0,
    unrecognizedDebitEvents:
      typeof value.unrecognizedDebitEvents === "number"
        ? value.unrecognizedDebitEvents
        : 0,
  };
}

export function getWorkspaceBillingReconciliationSnapshot(
  twilioData: unknown,
): BillingReconciliationSnapshot | null {
  if (!isObject(twilioData)) {
    return null;
  }
  return (
    normalizeBillingReconciliationSnapshot(
      twilioData.billingReconciliationSnapshot,
    ) ?? null
  );
}

export async function persistWorkspaceBillingReconciliationSnapshot(args: {
  workspaceId: string;
  report: BillingReconciliationReport;
  source: BillingReconciliationSnapshot["lastRunSource"];
}): Promise<BillingReconciliationSnapshot> {
  const snapshot = buildBillingReconciliationSnapshot(args.report, args.source);
  await patchWorkspaceTwilioData(
    args.workspaceId,
    {
      billingReconciliationSnapshot: snapshot,
    },
  );
  return snapshot;
}

export function formatBillingReconciliationSnapshotSummary(
  snapshot: BillingReconciliationSnapshot | null,
): string {
  if (!snapshot?.lastRunAt) {
    return "No reconciliation snapshot recorded yet.";
  }

  const varianceLabel = snapshot.materialVariance ? "material variance" : "balanced";
  return `Last run ${snapshot.lastRunAt} (${snapshot.lastRunSource}, ${varianceLabel}).`;
}

export { DEFAULT_SNAPSHOT };
