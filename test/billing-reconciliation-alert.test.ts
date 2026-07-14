import { describe, expect, test } from "vitest";

import {
  BILLING_RECONCILIATION_VARIANCE_THRESHOLD,
  buildBillingReconciliationAlertDetails,
  exceedsBillingVarianceThreshold,
  hasMaterialBillingVariance,
  type BillingReconciliationReport,
} from "../shared/billing-reconciliation";
import {
  getBillingReconciliationDriftMarker,
  shouldSendBillingReconciliationDriftEmail,
} from "../shared/billing-reconciliation-alert";

function sampleReport(overrides?: Partial<BillingReconciliationReport>): BillingReconciliationReport {
  return {
    period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    categories: {
      sms: {
        twilioUnits: 10,
        twilioUnitLabel: "segments",
        ledgerEvents: 10,
        ledgerCredits: 10,
        variance: 0,
      },
      voice: {
        twilioUnits: 5,
        twilioUnitLabel: "minutes",
        ledgerEvents: 5,
        ledgerCredits: 20,
        variance: 0,
      },
      numbers: {
        twilioUnits: 1,
        twilioUnitLabel: "number-months",
        ledgerEvents: 1,
        ledgerCredits: 100,
        variance: 0,
      },
    },
    entityAudit: {
      billableMessages: 10,
      debitedMessages: 10,
      messageGap: 0,
      billableCalls: 5,
      debitedCalls: 5,
      callGap: 0,
    },
    twilioTotalCostUsd: 12.5,
    ledgerDebitCredits: 130,
    ledgerCreditPurchases: 0,
    unrecognizedDebitEvents: 0,
    ...overrides,
  };
}

describe("billing reconciliation alerting", () => {
  test("exceedsBillingVarianceThreshold uses shared constant", () => {
    expect(BILLING_RECONCILIATION_VARIANCE_THRESHOLD).toBe(2);
    expect(exceedsBillingVarianceThreshold(2)).toBe(false);
    expect(exceedsBillingVarianceThreshold(3)).toBe(true);
    expect(exceedsBillingVarianceThreshold(-3)).toBe(true);
  });

  test("hasMaterialBillingVariance flags unrecognized debits at any count", () => {
    const report = sampleReport({ unrecognizedDebitEvents: 1 });
    expect(hasMaterialBillingVariance(report)).toBe(true);
  });

  test("buildBillingReconciliationAlertDetails surfaces drift fields", () => {
    const report = sampleReport({
      categories: {
        ...sampleReport().categories,
        sms: { ...sampleReport().categories.sms, variance: 12 },
      },
      entityAudit: {
        ...sampleReport().entityAudit,
        messageGap: 8,
      },
    });
    const details = buildBillingReconciliationAlertDetails(report);
    expect(details.smsVariance).toBe(12);
    expect(details.messageGap).toBe(8);
    expect(details.period.startDate).toBe("2026-05-01");
  });

  test("shouldSendBillingReconciliationDriftEmail dedupes within the same period", () => {
    const snapshot = {
      lastRunAt: "2026-06-01T00:00:00.000Z",
      lastRunSource: "cron" as const,
      materialVariance: true,
      period: { startDate: "2026-05-01", endDate: "2026-05-31" },
      smsVariance: 10,
      voiceVariance: 0,
      messageGap: 10,
      callGap: 0,
      unrecognizedDebitEvents: 0,
    };
    const marker = getBillingReconciliationDriftMarker({
      billingReconciliationDriftAlert: {
        alertedAt: "2026-05-15T00:00:00.000Z",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        smsVariance: 10,
        voiceVariance: 0,
        messageGap: 10,
        callGap: 0,
      },
    });

    expect(
      shouldSendBillingReconciliationDriftEmail({ snapshot, marker }),
    ).toBe(false);
    expect(
      shouldSendBillingReconciliationDriftEmail({
        snapshot,
        marker: marker
          ? { ...marker, periodStart: "2026-04-01", periodEnd: "2026-04-30" }
          : null,
      }),
    ).toBe(true);
  });

  test("shouldSendBillingReconciliationDriftEmail skips when balanced", () => {
    expect(
      shouldSendBillingReconciliationDriftEmail({
        snapshot: {
          lastRunAt: "2026-06-01T00:00:00.000Z",
          lastRunSource: "cron",
          materialVariance: false,
          period: { startDate: "2026-05-01", endDate: "2026-05-31" },
          smsVariance: 0,
          voiceVariance: 0,
          messageGap: 0,
          callGap: 0,
          unrecognizedDebitEvents: 0,
        },
        marker: null,
      }),
    ).toBe(false);
  });
});
