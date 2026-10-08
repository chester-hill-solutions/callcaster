import { NUMBER_RENTAL_MONTHLY_CREDITS } from "./pricing";
import {
  NUMBER_RENTAL_ROLLOUT_CUTOFF_DATE,
  numberRentalDueDate,
} from "./number-rental-cycle";
import type {
  BillingReconciliationPeriod,
  LedgerTransactionRow,
  TwilioUsageRecord,
} from "./billing-reconciliation";

export type NumberRentalHistory = {
  id: number;
  createdAt: string;
  // Release intent and completion bound the provider release. Its exact time
  // is not recoverable from the deleted active row.
  releaseStartedAt?: string;
  releaseCompletedAt?: string;
};

export type NumberRentalReconciliationInput = {
  period: BillingReconciliationPeriod;
  twilioUsage: TwilioUsageRecord[];
  ledgerRows: LedgerTransactionRow[];
  history: NumberRentalHistory[];
  coverageIssue?: string;
};

export type NumberRentalReconciliation = {
  period: BillingReconciliationPeriod;
  twilioUnits: number | null;
  twilioUnitLabel: string;
  ledgerEvents: number;
  ledgerCredits: number;
  variance: number | null;
  comparisonIssue: string | null;
};

const RENTAL_CATEGORIES = [
  "phonenumbers-local",
  "phonenumbers-mobile",
  "phonenumbers-tollfree",
];
const NON_RENTAL_CATEGORIES = [
  "phonenumbers-emergency",
  "phonenumbers-cps",
  "phonenumbers-porting",
];

function quantity(record: TwilioUsageRecord, unit: string): number | null {
  const value = record.usage.trim() === "" ? NaN : Number(record.usage);
  return record.usageUnit === unit && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function providerRentals(input: NumberRentalReconciliationInput) {
  const records = input.twilioUsage.filter(
    (record) =>
      RENTAL_CATEGORIES.includes(record.category) ||
      record.category === "phonenumbers-setups",
  );
  const unknown = input.twilioUsage.some(
    (record) =>
      record.category.startsWith("phonenumbers-") &&
      !RENTAL_CATEGORIES.includes(record.category) &&
      !NON_RENTAL_CATEGORIES.includes(record.category) &&
      record.category !== "phonenumbers-setups" &&
      (Number(record.usage) !== 0 || Number(record.price) !== 0),
  );
  if (
    unknown ||
    new Set(records.map((record) => record.category)).size !== records.length
  )
    return null;
  let rentals = 0;
  let setups = 0;
  for (const record of records) {
    if (
      record.startDate?.slice(0, 10) !== input.period.startDate ||
      record.endDate?.slice(0, 10) !== input.period.endDate
    )
      return null;
    const value = quantity(
      record,
      record.category === "phonenumbers-setups" ? "number-setups" : "numbers",
    );
    if (value === null) return null;
    if (record.category === "phonenumbers-setups") setups += value;
    else rentals += value;
  }
  const aggregate = input.twilioUsage.find(
    (record) => record.category === "phonenumbers",
  );
  if (
    !records.some((record) => RENTAL_CATEGORIES.includes(record.category)) &&
    aggregate &&
    Number(aggregate.usage) !== 0
  )
    return null;
  if (
    rentals > 0 &&
    !records.some((record) => record.category === "phonenumbers-setups")
  )
    return null;
  return Number.isSafeInteger(rentals) && setups <= rentals
    ? { rentals, setups }
    : null;
}

function historyCycles(input: NumberRentalReconciliationInput) {
  const month = input.period.startDate.slice(0, 7);
  const monthEnd = Date.parse(`${input.period.endDate}T23:59:59.999Z`);
  const monthStart = Date.parse(`${input.period.startDate}T00:00:00.000Z`);
  let firstCycles = 0;
  let renewalCycles = 0;
  let exemptCycles = 0;
  const seen = new Set<number>();
  for (const number of input.history) {
    const anchor = Date.parse(number.createdAt);
    if (
      !Number.isSafeInteger(number.id) ||
      number.id <= 0 ||
      seen.has(number.id) ||
      !Number.isFinite(anchor)
    )
      return null;
    seen.add(number.id);
    const releaseStart = number.releaseStartedAt
      ? Date.parse(number.releaseStartedAt)
      : null;
    const releaseEnd = number.releaseCompletedAt
      ? Date.parse(number.releaseCompletedAt)
      : null;
    if (
      (releaseStart !== null &&
        (!Number.isFinite(releaseStart) || releaseStart < anchor)) ||
      (releaseEnd !== null &&
        (releaseStart === null ||
          !Number.isFinite(releaseEnd) ||
          releaseEnd < releaseStart))
    )
      return null;
    if (anchor > monthEnd) continue;
    if (new Date(anchor).toISOString().slice(0, 7) === month) {
      firstCycles++;
      continue;
    }
    const due = numberRentalDueDate(
      number.createdAt,
      new Date(monthStart),
    ).getTime();
    if (releaseStart !== null) {
      if (releaseEnd !== null && releaseEnd < due) continue;
      // If the release can fall on either side of the renewal, neither charge
      // presence nor exemption is proven for this calendar month.
      if (releaseStart <= due) return null;
    }
    renewalCycles++;
    // Match the existing sweep's text-column cutoff without changing which
    // legacy numbers it bills.
    if (number.createdAt < NUMBER_RENTAL_ROLLOUT_CUTOFF_DATE) exemptCycles++;
  }
  return { firstCycles, renewalCycles, exemptCycles };
}

export function buildNumberRentalReconciliation(
  input: NumberRentalReconciliationInput,
): NumberRentalReconciliation {
  const month = input.period.startDate.slice(0, 7);
  const candidateRows = input.ledgerRows.filter((row) =>
    row.idempotency_key?.trim().startsWith("number_rent:"),
  );
  const invalidKey = candidateRows.some(
    (row) =>
      !/^number_rent:([1-9]\d*):(\d{4}-(?:0[1-9]|1[0-2]))$/.test(
        row.idempotency_key ?? "",
      ),
  );
  const rows = candidateRows.filter((row) =>
    row.idempotency_key?.endsWith(`:${month}`),
  );
  const result: NumberRentalReconciliation = {
    period: input.period,
    twilioUnits: null,
    twilioUnitLabel: "renewals",
    ledgerEvents: rows.length,
    ledgerCredits: rows.reduce((sum, row) => sum + Math.abs(row.amount), 0),
    variance: null,
    comparisonIssue: input.coverageIssue ?? null,
  };
  if (input.coverageIssue) return result;
  if (invalidKey)
    return {
      ...result,
      comparisonIssue: "A rental debit has an invalid cycle key.",
    };
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(input.period.startDate)) {
    return {
      ...result,
      comparisonIssue:
        "Rental usage must cover one complete UTC calendar month.",
    };
  }
  const start = new Date(`${input.period.startDate}T00:00:00.000Z`);
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  if (
    input.period.startDate.slice(8) !== "01" ||
    input.period.endDate !== lastDay
  ) {
    return {
      ...result,
      comparisonIssue:
        "Rental usage must cover one complete UTC calendar month.",
    };
  }
  const provider = providerRentals(input);
  if (!provider)
    return {
      ...result,
      comparisonIssue:
        "Rental usage has unsupported categories, units or dates.",
    };
  const history = historyCycles(input);
  if (!history || provider.setups !== history.firstCycles) {
    return {
      ...result,
      comparisonIssue:
        "Initial rental or release history does not establish period coverage.",
    };
  }
  const recurring = provider.rentals - provider.setups;
  if (recurring !== history.renewalCycles) {
    return {
      ...result,
      comparisonIssue:
        "Provider rental usage does not match the known rental history for this period.",
    };
  }
  for (const row of rows) {
    const key = /^number_rent:([1-9]\d*):(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
      row.idempotency_key ?? "",
    );
    if (
      !key ||
      row.type !== "DEBIT" ||
      row.amount >= 0 ||
      !Number.isSafeInteger(-row.amount / NUMBER_RENTAL_MONTHLY_CREDITS) ||
      row.amount === 0
    ) {
      return {
        ...result,
        comparisonIssue:
          "A rental debit has an invalid cycle, sign or credit quantity.",
      };
    }
    if (!input.history.some((number) => number.id === Number(key[1]))) {
      return {
        ...result,
        comparisonIssue: "A rental debit has no recorded number identity.",
      };
    }
  }
  const units = recurring - history.exemptCycles;
  return {
    ...result,
    twilioUnits: units,
    variance: units - result.ledgerCredits / NUMBER_RENTAL_MONTHLY_CREDITS,
  };
}
