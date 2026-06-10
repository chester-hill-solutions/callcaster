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
  bucket: "sms" | "voice" | "numbers" | "purchase" | "other";
  credits: number;
} {
  const key = row.idempotency_key?.trim() ?? "";
  const credits = Math.abs(row.amount);

  if (row.type === "CREDIT") {
    if (key.startsWith("stripe_evt:") || key.startsWith("stripe_session:")) {
      return { bucket: "purchase", credits };
    }
    return { bucket: "purchase", credits };
  }

  if (key.startsWith("sms:")) {
    return { bucket: "sms", credits };
  }
  if (key.startsWith("call:")) {
    return { bucket: "voice", credits };
  }
  if (key.startsWith("number_rent:") || key.startsWith("number_rent_purchase:")) {
    return { bucket: "numbers", credits };
  }

  return { bucket: "other", credits };
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
        variance: smsTwilioUnits - ledgerSummary.sms.events,
      },
      voice: {
        twilioUnits: voiceTwilioMinutes,
        twilioUnitLabel: "minutes",
        ledgerEvents: ledgerSummary.voice.events,
        ledgerCredits: ledgerSummary.voice.credits,
        variance: voiceTwilioMinutes - ledgerSummary.voice.events,
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
      ledgerSummary.other.credits,
    ledgerCreditPurchases: ledgerSummary.purchase.credits,
    unrecognizedDebitEvents: ledgerSummary.other.events,
  };
}

export function hasMaterialBillingVariance(
  report: BillingReconciliationReport,
): boolean {
  return (
    Math.abs(report.categories.sms.variance) > 2 ||
    Math.abs(report.categories.voice.variance) > 2 ||
    Math.abs(report.entityAudit.messageGap) > 2 ||
    Math.abs(report.entityAudit.callGap) > 2 ||
    report.unrecognizedDebitEvents > 0
  );
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
