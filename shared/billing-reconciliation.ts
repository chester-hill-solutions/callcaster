// Inline bucket classifier to avoid cross-file import incompatibility between Node (extensionless) and Deno (.ts extension).
// Keep in sync with `shared/billing-keys.ts` `bucketFromIdempotencyKey`.
type LedgerBucket = "sms" | "voice" | "numbers" | "purchase" | "ai" | "other";

function bucketFromIdempotencyKey(
  idempotencyKey: string | null | undefined,
): LedgerBucket {
  const key = idempotencyKey?.trim() ?? "";
  if (key.startsWith("sms:")) return "sms";
  if (key.startsWith("call:")) return "voice";
  if (key.startsWith("number_rent:") || key.startsWith("number_rent_purchase:")) return "numbers";
  if (key.startsWith("stripe_evt:") || key.startsWith("stripe_session:")) return "purchase";
  if (
    key.startsWith("transcription:") ||
    key.startsWith("transcription_batch:") ||
    key.startsWith("coaching:")
  ) {
    return "ai";
  }
  return "other";
}

export type TwilioUsageRecord = {
  category: string;
  description: string;
  usage: string;
  usageUnit: string;
  price: string;
  startDate?: string;
  endDate?: string;
};

export type LedgerTransactionRow = {
  type: string;
  amount: number;
  idempotency_key: string | null;
  created_at: string;
};

export type BillingReconciliationPeriod = {
  startDate: string;
  endDate: string;
};

export type BillingCategoryReconciliation = {
  twilioUnits: number;
  twilioUnitLabel: string;
  ledgerEvents: number;
  ledgerCredits: number;
  variance: number;
};

export type BillingEntityAudit = {
  billableMessages: number;
  debitedMessages: number;
  messageGap: number;
  billableCalls: number;
  debitedCalls: number;
  callGap: number;
  /**
   * Started minutes across billable calls, on Twilio's own rounding
   * (`ceil(seconds / 60)`, minimum 1). This is the only figure comparable to
   * Twilio's `calls-outbound` usage; the ledger cannot supply it, because voice
   * credits are 2–5 per minute depending on whether the call was IVR or staffed.
   */
  billedVoiceMinutes: number;
};

export type BillingReconciliationReport = {
  period: BillingReconciliationPeriod;
  categories: {
    sms: BillingCategoryReconciliation;
    voice: BillingCategoryReconciliation;
    numbers: BillingCategoryReconciliation;
  };
  entityAudit: BillingEntityAudit;
  twilioTotalCostUsd: number;
  ledgerDebitCredits: number;
  ledgerCreditPurchases: number;
  unrecognizedDebitEvents: number;
};

function parseUsageAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumTwilioUsage(
  records: TwilioUsageRecord[],
  categoryMatcher: (category: string) => boolean,
): number {
  return records.reduce((sum, record) => {
    if (record.category === "totalprice") {
      return sum;
    }
    if (!categoryMatcher(record.category)) {
      return sum;
    }
    return sum + parseUsageAmount(record.usage);
  }, 0);
}

function sumTwilioCostUsd(
  records: TwilioUsageRecord[],
  categoryMatcher: (category: string) => boolean,
): number {
  return records.reduce((sum, record) => {
    if (record.category === "totalprice") {
      return sum;
    }
    if (!categoryMatcher(record.category)) {
      return sum;
    }
    return sum + parseUsageAmount(record.price);
  }, 0);
}

export function categorizeLedgerRow(row: LedgerTransactionRow): {
  bucket: LedgerBucket;
  credits: number;
} {
  const key = row.idempotency_key?.trim() ?? "";
  const credits = Math.abs(row.amount);

  if (row.type === "CREDIT") {
    return { bucket: "purchase", credits };
  }

  return { bucket: bucketFromIdempotencyKey(key), credits };
}

export function filterLedgerRowsInPeriod(
  rows: LedgerTransactionRow[],
  period: BillingReconciliationPeriod,
): LedgerTransactionRow[] {
  const startMs = Date.parse(`${period.startDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${period.endDate}T23:59:59.999Z`);
  return rows.filter((row) => {
    const createdMs = Date.parse(row.created_at);
    return createdMs >= startMs && createdMs <= endMs;
  });
}

export function summarizeLedger(rows: LedgerTransactionRow[]) {
  const summary = {
    sms: { events: 0, credits: 0 },
    voice: { events: 0, credits: 0 },
    numbers: { events: 0, credits: 0 },
    purchase: { events: 0, credits: 0 },
    ai: { events: 0, credits: 0 },
    other: { events: 0, credits: 0 },
  };

  for (const row of rows) {
    if (row.type !== "DEBIT" && row.type !== "CREDIT") {
      continue;
    }
    const { bucket, credits } = categorizeLedgerRow(row);
    summary[bucket].events += 1;
    if (row.type === "DEBIT") {
      summary[bucket].credits += credits;
    } else if (bucket === "purchase") {
      summary.purchase.credits += credits;
    }
  }

  return summary;
}

export function buildBillingReconciliationReport(args: {
  period: BillingReconciliationPeriod;
  twilioUsage: TwilioUsageRecord[];
  ledgerRows: LedgerTransactionRow[];
  entityAudit: BillingEntityAudit;
}): BillingReconciliationReport {
  const ledgerInPeriod = filterLedgerRowsInPeriod(args.ledgerRows, args.period);
  const ledgerSummary = summarizeLedger(ledgerInPeriod);

  const smsTwilioUnits = sumTwilioUsage(
    args.twilioUsage,
    (category) =>
      category === "sms-outbound" || category.startsWith("sms-outbound-"),
  );
  const voiceTwilioMinutes = sumTwilioUsage(
    args.twilioUsage,
    (category) =>
      category === "calls-outbound" || category.startsWith("calls-outbound-"),
  );
  const numbersTwilioUnits = sumTwilioUsage(
    args.twilioUsage,
    (category) =>
      category === "phonenumbers" || category.startsWith("phonenumbers-"),
  );

  const twilioTotalCostUsd =
    sumTwilioCostUsd(args.twilioUsage, () => true) ||
    parseUsageAmount(
      args.twilioUsage.find((record) => record.category === "totalprice")
        ?.price ?? "0",
    );

  return {
    period: args.period,
    categories: {
      sms: {
        twilioUnits: smsTwilioUnits,
        twilioUnitLabel: "segments",
        ledgerEvents: ledgerSummary.sms.events,
        ledgerCredits: ledgerSummary.sms.credits,
        // Segments against segments. SMS_SEGMENT_CREDITS is 1, so the credit
        // total IS the segment count — whereas the row count is one per
        // message, making every multi-segment SMS look like drift.
        variance: smsTwilioUnits - ledgerSummary.sms.credits,
      },
      voice: {
        twilioUnits: voiceTwilioMinutes,
        twilioUnitLabel: "minutes",
        ledgerEvents: ledgerSummary.voice.events,
        ledgerCredits: ledgerSummary.voice.credits,
        // Minutes against minutes. Neither the row count (one per call, so a
        // 10-minute call read as 9 minutes of drift) nor the credit total
        // (2–5 credits per minute depending on IVR vs staffed) is comparable
        // to Twilio's minutes.
        variance: voiceTwilioMinutes - args.entityAudit.billedVoiceMinutes,
      },
      numbers: {
        twilioUnits: numbersTwilioUnits,
        twilioUnitLabel: "number-months",
        ledgerEvents: ledgerSummary.numbers.events,
        ledgerCredits: ledgerSummary.numbers.credits,
        variance: numbersTwilioUnits - ledgerSummary.numbers.events,
      },
    },
    entityAudit: args.entityAudit,
    twilioTotalCostUsd,
    ledgerDebitCredits:
      ledgerSummary.sms.credits +
      ledgerSummary.voice.credits +
      ledgerSummary.numbers.credits +
      ledgerSummary.ai.credits +
      ledgerSummary.other.credits,
    ledgerCreditPurchases: ledgerSummary.purchase.credits,
    unrecognizedDebitEvents: ledgerSummary.other.events,
  };
}

/** Twilio-vs-ledger unit/event gaps above this count trigger material-variance alerts. */
export const BILLING_RECONCILIATION_VARIANCE_THRESHOLD = 2;

export function exceedsBillingVarianceThreshold(value: number): boolean {
  return Math.abs(value) > BILLING_RECONCILIATION_VARIANCE_THRESHOLD;
}

export function hasMaterialBillingVariance(
  report: BillingReconciliationReport,
): boolean {
  return (
    exceedsBillingVarianceThreshold(report.categories.sms.variance) ||
    exceedsBillingVarianceThreshold(report.categories.voice.variance) ||
    exceedsBillingVarianceThreshold(report.entityAudit.messageGap) ||
    exceedsBillingVarianceThreshold(report.entityAudit.callGap) ||
    report.unrecognizedDebitEvents > 0
  );
}

export type BillingReconciliationAlertDetails = {
  period: BillingReconciliationPeriod;
  smsVariance: number;
  voiceVariance: number;
  messageGap: number;
  callGap: number;
  unrecognizedDebitEvents: number;
  twilioTotalCostUsd: number;
  ledgerDebitCredits: number;
};

export function buildBillingReconciliationAlertDetails(
  report: BillingReconciliationReport,
): BillingReconciliationAlertDetails {
  return {
    period: report.period,
    smsVariance: report.categories.sms.variance,
    voiceVariance: report.categories.voice.variance,
    messageGap: report.entityAudit.messageGap,
    callGap: report.entityAudit.callGap,
    unrecognizedDebitEvents: report.unrecognizedDebitEvents,
    twilioTotalCostUsd: report.twilioTotalCostUsd,
    ledgerDebitCredits: report.ledgerDebitCredits,
  };
}

export type BillingReconciliationSnapshot = {
  lastRunAt: string;
  lastRunSource: "cron" | "admin";
  materialVariance: boolean;
  period: BillingReconciliationPeriod;
  smsVariance: number;
  voiceVariance: number;
  messageGap: number;
  callGap: number;
  unrecognizedDebitEvents: number;
};

export function buildBillingReconciliationSnapshot(
  report: BillingReconciliationReport,
  source: BillingReconciliationSnapshot["lastRunSource"],
): BillingReconciliationSnapshot {
  return {
    lastRunAt: new Date().toISOString(),
    lastRunSource: source,
    materialVariance: hasMaterialBillingVariance(report),
    period: report.period,
    smsVariance: report.categories.sms.variance,
    voiceVariance: report.categories.voice.variance,
    messageGap: report.entityAudit.messageGap,
    callGap: report.entityAudit.callGap,
    unrecognizedDebitEvents: report.unrecognizedDebitEvents,
  };
}
