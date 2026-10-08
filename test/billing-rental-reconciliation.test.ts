import { describe, expect, test } from "vitest";
import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  buildBillingReconciliationAlertDetails,
  hasMaterialBillingVariance,
  type LedgerTransactionRow,
  type TwilioUsageRecord,
} from "../shared/billing-reconciliation";
import { normalizeBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import { getBillingReconciliationDriftMarker } from "../shared/billing-reconciliation-alert";
const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
const entityAudit = {
  billableMessages: 0,
  debitedMessages: 0,
  messageGap: 0,
  billableCalls: 0,
  debitedCalls: 0,
  callGap: 0,
  billedVoiceMinutes: 0,
};
function usage(
  category: string,
  quantity: number,
  usageUnit = "numbers",
): TwilioUsageRecord {
  return {
    category,
    description: category,
    usage: String(quantity),
    usageUnit,
    price: "0",
    startDate: period.startDate,
    endDate: period.endDate,
  };
}
function renewal(
  id: number,
  month = "2026-05",
  created_at = "2026-05-15T00:00:00Z",
): LedgerTransactionRow {
  return {
    type: "DEBIT",
    amount: -100,
    idempotency_key: `number_rent:${id}:${month}`,
    created_at,
  };
}
const history = [
  { id: 1, createdAt: "2026-04-01T00:00:00Z" },
  { id: 2, createdAt: "2026-04-02T00:00:00Z" },
  { id: 3, createdAt: "2026-04-03T00:00:00Z" },
];
function report(
  ledgerRows: LedgerTransactionRow[],
  twilioUsage: TwilioUsageRecord[],
  rentals = history,
) {
  const records = twilioUsage.some((r) => r.category === "phonenumbers-setups")
    ? twilioUsage
    : [...twilioUsage, usage("phonenumbers-setups", 0, "number-setups")];
  return buildBillingReconciliationReport({
    period,
    entityAudit,
    ledgerRows,
    twilioUsage,
    numberRentals: {
      period,
      ledgerRows,
      twilioUsage: records,
      history: rentals,
    },
  });
}
describe("recurring rental reconciliation (#2113)", () => {
  test("above-threshold numbers-only drift alerts", () =>
    expect(
      hasMaterialBillingVariance(report([], [usage("phonenumbers-local", 3)])),
    ).toBe(true));
  test("negative numbers-only drift alerts", () =>
    expect(
      hasMaterialBillingVariance(
        report(
          [{ ...renewal(1), amount: -500 }],
          [usage("phonenumbers-local", 1)],
          history.slice(0, 1),
        ),
      ),
    ).toBe(true));
  test("snapshot retains rental variance", () =>
    expect(
      buildBillingReconciliationSnapshot(
        report([], [usage("phonenumbers-local", 3)]),
        "cron",
      ),
    ).toMatchObject({ numbersVariance: 3 }));
  test("normalization retains rental variance", () =>
    expect(
      normalizeBillingReconciliationSnapshot(
        buildBillingReconciliationSnapshot(
          report([], [usage("phonenumbers-local", 3)]),
          "cron",
        ),
      ),
    ).toMatchObject({ numbersVariance: 3 }));
  test("alert details retain rental variance", () =>
    expect(
      buildBillingReconciliationAlertDetails(
        report([], [usage("phonenumbers-local", 3)]),
      ),
    ).toMatchObject({ numbersVariance: 3 }));
  test("aggregate is not added to its rental subtype", () =>
    expect(
      report(
        [renewal(1)],
        [usage("phonenumbers", 1), usage("phonenumbers-local", 1)],
        history.slice(0, 1),
      ).categories.numbers.variance,
    ).toBe(0));
  test("emergency and CPS quantities do not count as rented numbers", () =>
    expect(
      report(
        [renewal(1)],
        [
          usage("phonenumbers-local", 1),
          usage("phonenumbers-emergency", 1),
          usage("phonenumbers-cps", 2, "cps"),
        ],
        history.slice(0, 1),
      ).categories.numbers.variance,
    ).toBe(0));
  test("unsupported rental units stay unavailable", () =>
    expect(
      report(
        [renewal(1)],
        [usage("phonenumbers-local", 1, "number-months")],
        history.slice(0, 1),
      ).categories.numbers.variance,
    ).toBeNull());
  test("catch-up paid after month end retains its recorded cycle", () =>
    expect(
      report(
        [renewal(1, "2026-05", "2026-06-02T00:00:00Z")],
        [usage("phonenumbers-local", 1)],
        history.slice(0, 1),
      ).categories.numbers.variance,
    ).toBe(0));
  test("an older cycle paid this month does not move into this month", () =>
    expect(
      report([renewal(1, "2026-04")], [], []).categories.numbers.variance,
    ).toBe(0));
  test("first prepaid rental with a setup record is separate from renewals", () =>
    expect(
      report(
        [
          {
            type: "DEBIT",
            amount: -100,
            idempotency_key: "number_rent_purchase:fixture:PNfixture",
            created_at: "2026-05-15T00:00:00Z",
          },
        ],
        [
          usage("phonenumbers-local", 1),
          usage("phonenumbers-setups", 1, "number-setups"),
        ],
        [{ id: 1, createdAt: "2026-05-15T00:00:00Z" }],
      ).categories.numbers.variance,
    ).toBe(0));
  test("one renewal balances in real provider units", () =>
    expect(
      report(
        [renewal(1)],
        [usage("phonenumbers-local", 1)],
        history.slice(0, 1),
      ).categories.numbers.variance,
    ).toBe(0));
  test("below-threshold numbers-only gap is silent", () =>
    expect(
      hasMaterialBillingVariance(
        report([], [usage("phonenumbers-local", 2)], history.slice(0, 2)),
      ),
    ).toBe(false));
  test("SMS drift remains active", () =>
    expect(
      hasMaterialBillingVariance(
        report([], [usage("sms-outbound", 3, "messages")], []),
      ),
    ).toBe(true));
  test.each([3, -4, null])(
    "the marker parser retains rental variance %s and its separate period",
    (numbersVariance) => {
      expect(
        getBillingReconciliationDriftMarker({
          billingReconciliationDriftAlert: {
            alertedAt: "2026-06-06T00:00:00Z",
            periodStart: "2026-05-06",
            periodEnd: "2026-06-06",
            numbersVariance,
            numbersPeriod: period,
          },
        }),
      ).toMatchObject({ numbersVariance, numbersPeriod: period });
    },
  );
  test("older snapshots do not invent a recorded rental period", () => {
    expect(
      normalizeBillingReconciliationSnapshot({
        lastRunAt: "2026-06-06T00:00:00Z",
      }),
    ).toMatchObject({
      numbersVariance: 0,
      numbersPeriod: null,
    });
  });
});
