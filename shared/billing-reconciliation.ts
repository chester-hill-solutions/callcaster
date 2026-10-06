import {
  buildNumberRentalReconciliation,
  type NumberRentalReconciliation,
  type NumberRentalReconciliationInput,
} from "./number-rental-reconciliation";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS } from "./pricing";
import { bucketFromIdempotencyKey, type BillingBucket } from "./billing-keys";

type LedgerBucket = BillingBucket | "mms";

export type TwilioUsageRecord = {
  category: string;
  description: string;
  usage: string;
  usageUnit: string;
  price: string;
  priceUnit?: string;
  startDate?: string;
  endDate?: string;
};

export type LedgerTransactionRow = {
  type: string;
  amount: number;
  idempotency_key: string | null;
  created_at: string;
  note?: string | null;
  message_sid?: string | null;
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

export type BillingMessageReconciliation = Omit<BillingCategoryReconciliation, "twilioUnits" | "variance"> & {
  twilioUnits: number | null;
  variance: number | null;
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
    sms: BillingMessageReconciliation;
    mms: BillingMessageReconciliation;
    voice: BillingCategoryReconciliation;
    numbers: NumberRentalReconciliation;
  };
  entityAudit: BillingEntityAudit;
  twilioTotalCostUsd: number | null;
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

function messageUsageUnits(
  records: TwilioUsageRecord[],
  kind: "sms" | "mms",
): number | null {
  const aggregate = `${kind}-outbound`;
  const totals = records.filter((record) => record.category === aggregate);
  const subtypes = [`${aggregate}-longcode`, `${aggregate}-shortcode`];
  const selected = totals.length > 0
    ? totals
    : records.filter((record) => subtypes.includes(record.category));

  // Aggregate records already include their subtypes. Unknown outbound
  // categories cannot establish complete coverage when no aggregate exists.
  const hasUnknownSubtype = records.some((record) =>
    record.category.startsWith(`${aggregate}-`) && !subtypes.includes(record.category),
  );
  if (totals.length > 1 || (totals.length === 0 && hasUnknownSubtype)) {
    return null;
  }
  if (new Set(selected.map((record) => record.category)).size !== selected.length) {
    return null;
  }

  let units = 0;
  for (const record of selected) {
    // Twilio bills each SMS segment as a message in UsageRecords.
    // The explicit segments unit also supports the existing adapter fixtures.
    const supportedUnit = record.usageUnit === "messages" ||
      (kind === "sms" && record.usageUnit === "segments");
    const quantity = record.usage.trim() === "" ? NaN : Number(record.usage);
    if (!supportedUnit || !Number.isSafeInteger(quantity) || quantity < 0) {
      return null;
    }
    units += quantity;
    if (!Number.isSafeInteger(units)) return null;
  }
  return units;
}

function providerTotalCostUsd(
  records: TwilioUsageRecord[],
  period: BillingReconciliationPeriod,
): number | null {
  const totals = records.filter((record) => record.category === "totalprice");
  const total = totals[0];
  if (!total || totals.length !== 1) return null;
  if (total.priceUnit?.toLowerCase() !== "usd") return null;
  if (
    ![period.startDate, `${period.startDate}T00:00:00.000Z`].includes(
      total.startDate ?? "",
    ) ||
    ![period.endDate, `${period.endDate}T00:00:00.000Z`].includes(
      total.endDate ?? "",
    )
  )
    return null;

  // Category prices can overlap and can omit account costs. Only the provider
  // total establishes the complete cost for this currency and reporting period.
  const value = total.price.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
    return null;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
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

  const bucket = bucketFromIdempotencyKey(key);
  if (bucket !== "sms") return { bucket, credits };

  // Both kinds use sms:<sid>. The durable debit note supplies kind; a
  // two-segment SMS and one MMS have the same credit amount.
  const marker = /^(SMS|MMS) (\S+) \S/.exec(row.note ?? "");
  const kind = marker?.[1];
  const rate = kind === "MMS" ? MMS_CREDITS : SMS_SEGMENT_CREDITS;
  if (
    !marker || key !== `sms:${marker[2]}` ||
    (row.message_sid != null && row.message_sid !== marker[2]) ||
    row.amount >= 0 || !Number.isSafeInteger(credits / rate) || credits === 0
  ) {
    return { bucket: "other", credits };
  }
  return { bucket: kind === "MMS" ? "mms" : "sms", credits };
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
    mms: { events: 0, credits: 0 },
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
  numberRentals: NumberRentalReconciliationInput;
}): BillingReconciliationReport {
  const ledgerInPeriod = filterLedgerRowsInPeriod(args.ledgerRows, args.period);
  const ledgerSummary = summarizeLedger(ledgerInPeriod);
  const smsLedgerSegments =
    ledgerSummary.sms.credits / SMS_SEGMENT_CREDITS;

  const smsTwilioUnits = messageUsageUnits(args.twilioUsage, "sms");
  const mmsTwilioUnits = messageUsageUnits(args.twilioUsage, "mms");
  const voiceTwilioMinutes = sumTwilioUsage(
    args.twilioUsage,
    (category) =>
      category === "calls-outbound" || category.startsWith("calls-outbound-"),
  );
  const numbers = buildNumberRentalReconciliation(args.numberRentals);

  const twilioTotalCostUsd = providerTotalCostUsd(args.twilioUsage, args.period);

  return {
    period: args.period,
    categories: {
      sms: {
        twilioUnits: smsTwilioUnits,
        twilioUnitLabel: "segments",
        ledgerEvents: ledgerSummary.sms.events,
        ledgerCredits: ledgerSummary.sms.credits,
        // Segments against segments. The ledger stores credits, so divide by
        // the per-segment rate to get segments back — whereas the row count
        // is one per message, making every multi-segment SMS look like drift.
        variance: smsTwilioUnits === null ? null : smsTwilioUnits - smsLedgerSegments,
      },
      mms: {
        twilioUnits: mmsTwilioUnits,
        twilioUnitLabel: "messages",
        ledgerEvents: ledgerSummary.mms.events,
        ledgerCredits: ledgerSummary.mms.credits,
        variance: mmsTwilioUnits === null ? null : mmsTwilioUnits - ledgerSummary.mms.credits / MMS_CREDITS,
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
      numbers,
    },
    entityAudit: args.entityAudit,
    twilioTotalCostUsd,
    ledgerDebitCredits:
      ledgerSummary.sms.credits +
      ledgerSummary.mms.credits +
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

export function exceedsBillingVarianceThreshold(value: number | null): boolean {
  // An unavailable comparison must not clear a drift alert.
  return value === null || Math.abs(value) > BILLING_RECONCILIATION_VARIANCE_THRESHOLD;
}

export function hasMaterialBillingVariance(
  report: BillingReconciliationReport,
): boolean {
  return (
    exceedsBillingVarianceThreshold(report.categories.sms.variance) ||
    exceedsBillingVarianceThreshold(report.categories.mms.variance) ||
    exceedsBillingVarianceThreshold(report.categories.voice.variance) ||
    exceedsBillingVarianceThreshold(report.categories.numbers.variance) ||
    exceedsBillingVarianceThreshold(report.entityAudit.messageGap) ||
    exceedsBillingVarianceThreshold(report.entityAudit.callGap) ||
    report.unrecognizedDebitEvents > 0
  );
}

export type BillingReconciliationAlertDetails = {
  period: BillingReconciliationPeriod;
  smsVariance: number | null;
  mmsVariance: number | null;
  voiceVariance: number;
  numbersVariance: number | null;
  numbersPeriod: BillingReconciliationPeriod | null;
  messageGap: number;
  callGap: number;
  unrecognizedDebitEvents: number;
  twilioTotalCostUsd: number | null;
  ledgerDebitCredits: number;
};

export function buildBillingReconciliationAlertDetails(
  report: BillingReconciliationReport,
): BillingReconciliationAlertDetails {
  return {
    period: report.period,
    smsVariance: report.categories.sms.variance,
    mmsVariance: report.categories.mms.variance,
    voiceVariance: report.categories.voice.variance,
    numbersVariance: report.categories.numbers.variance,
    numbersPeriod: report.categories.numbers.period ?? null,
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
  smsVariance: number | null;
  mmsVariance: number | null;
  voiceVariance: number;
  numbersVariance: number | null;
  numbersPeriod: BillingReconciliationPeriod | null;
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
    mmsVariance: report.categories.mms.variance,
    voiceVariance: report.categories.voice.variance,
    numbersVariance: report.categories.numbers.variance,
    numbersPeriod: report.categories.numbers.period ?? null,
    messageGap: report.entityAudit.messageGap,
    callGap: report.entityAudit.callGap,
    unrecognizedDebitEvents: report.unrecognizedDebitEvents,
  };
}
