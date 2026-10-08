import { describe, expect, test } from "vitest";
import {
  buildNumberRentalReconciliation,
  type NumberRentalHistory,
  type NumberRentalReconciliationInput,
} from "../shared/number-rental-reconciliation";
import {
  numberRentalReconciliationPeriod,
  numberRentalDueDate,
} from "../shared/number-rental-cycle";
const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
function usage(
  category: string,
  value: string | number,
  usageUnit = "numbers",
) {
  return {
    category,
    description: category,
    usage: String(value),
    usageUnit,
    price: "0",
    startDate: period.startDate,
    endDate: period.endDate,
  };
}
function number(
  id: number,
  createdAt = "2026-04-01T12:00:00Z",
): NumberRentalHistory {
  return { id, createdAt };
}
function ledger(
  id: number,
  month = "2026-05",
  created_at = "2026-05-15T00:00:00Z",
  amount = -100,
) {
  return {
    type: "DEBIT",
    amount,
    idempotency_key: `number_rent:${id}:${month}`,
    created_at,
  };
}
function input(
  overrides: Partial<NumberRentalReconciliationInput> = {},
): NumberRentalReconciliationInput {
  return {
    period,
    twilioUsage: [
      usage("phonenumbers-local", 1),
      usage("phonenumbers-setups", 0, "number-setups"),
    ],
    ledgerRows: [ledger(1)],
    history: [number(1)],
    ...overrides,
  };
}
function report(overrides: Partial<NumberRentalReconciliationInput> = {}) {
  return buildNumberRentalReconciliation(input(overrides));
}
describe("number-rental comparison contract (#2113)", () => {
  test("a nonzero aggregate plus zero setup cannot establish rental subtype coverage", () => {
    expect(
      report({
        history: [],
        ledgerRows: [],
        twilioUsage: [
          usage("phonenumbers", 1),
          usage("phonenumbers-setups", 0, "number-setups"),
        ],
      }).variance,
    ).toBeNull();
  });
  test("explicit zero rental subtypes retain empty-account balance", () => {
    expect(
      report({
        history: [],
        ledgerRows: [],
        twilioUsage: [
          usage("phonenumbers-local", 0),
          usage("phonenumbers-setups", 0, "number-setups"),
        ],
      }).variance,
    ).toBe(0);
  });
  test("one prepaid monthly renewal balances", () =>
    expect(report()).toMatchObject({
      twilioUnits: 1,
      ledgerEvents: 1,
      ledgerCredits: 100,
      variance: 0,
      comparisonIssue: null,
    }));
  test("aggregate plus emergency, CPS and porting do not add rental units", () =>
    expect(
      report({
        twilioUsage: [
          ...input().twilioUsage,
          usage("phonenumbers", 2),
          usage("phonenumbers-emergency", 1),
          usage("phonenumbers-cps", 3, "cps"),
          usage("phonenumbers-porting", 5, "ports"),
        ],
      }).variance,
    ).toBe(0));
  test("local, mobile and toll-free rental leaves add once", () =>
    expect(
      report({
        history: [number(1), number(2), number(3)],
        ledgerRows: [ledger(1), ledger(2), ledger(3)],
        twilioUsage: [
          ...input().twilioUsage,
          usage("phonenumbers-mobile", 1),
          usage("phonenumbers-tollfree", 1),
        ],
      }).variance,
    ).toBe(0));
  test("a new number's setup and first prepaid month are separate from renewal", () =>
    expect(
      report({
        history: [number(1, "2026-05-15T12:00:00Z")],
        ledgerRows: [
          {
            type: "DEBIT",
            amount: -100,
            idempotency_key: "number_rent_purchase:workspace:PNfixture",
            created_at: "2026-05-15T12:00:00Z",
          },
        ],
        twilioUsage: [
          usage("phonenumbers-local", 1),
          usage("phonenumbers-setups", 1, "number-setups"),
        ],
      }),
    ).toMatchObject({
      twilioUnits: 0,
      ledgerEvents: 0,
      ledgerCredits: 0,
      variance: 0,
    }));
  test("an initial purchase posted beside a later renewal does not count twice", () =>
    expect(
      report({
        ledgerRows: [
          ledger(1),
          {
            type: "DEBIT",
            amount: -100,
            idempotency_key: "number_rent_purchase:workspace:PNfixture",
            created_at: "2026-05-15T12:00:00Z",
          },
        ],
      }).variance,
    ).toBe(0));
  test("catch-up debit is assigned to its key month, even when paid later", () =>
    expect(
      report({ ledgerRows: [ledger(1, "2026-05", "2026-06-02T12:00:00Z")] })
        .variance,
    ).toBe(0));
  test("a prior cycle paid now does not become this month's renewal", () =>
    expect(
      report({ ledgerRows: [ledger(1), ledger(1, "2026-04")] }).variance,
    ).toBe(0));
  test("missing debits retain positive unit drift", () =>
    expect(
      report({
        history: [number(1), number(2), number(3)],
        ledgerRows: [],
        twilioUsage: [
          usage("phonenumbers-local", 3),
          usage("phonenumbers-setups", 0, "number-setups"),
        ],
      }).variance,
    ).toBe(3));
  test("excess debits retain negative unit drift", () =>
    expect(
      report({
        history: [1, 2, 3, 4].map((id) => ({
          ...number(id),
          releaseStartedAt: "2026-04-20T00:00:00Z",
          releaseCompletedAt: "2026-04-20T00:01:00Z",
        })),
        ledgerRows: [ledger(1), ledger(2), ledger(3), ledger(4)],
        twilioUsage: [
          usage("phonenumbers-local", 0),
          usage("phonenumbers-setups", 0, "number-setups"),
        ],
      }).variance,
    ).toBe(-4));
  test("overcharged credits are compared as units rather than row count", () =>
    expect(
      report({ ledgerRows: [ledger(1, "2026-05", undefined, -500)] }).variance,
    ).toBe(-4));
  test("a known grandfathered rental does not demand a new debit", () =>
    expect(
      report({ history: [number(1, "2026-03-31T23:59:59Z")], ledgerRows: [] })
        .variance,
    ).toBe(0));
  test("the rollout cutoff remains billable", () =>
    expect(
      report({ history: [number(1, "2026-04-01T00:00:00Z")], ledgerRows: [] })
        .variance,
    ).toBe(1));
  test("the same exemption survives deletion of the active number", () =>
    expect(
      report({
        history: [
          {
            ...number(1, "2026-03-15T12:00:00Z"),
            releaseStartedAt: "2026-05-20T10:00:00Z",
            releaseCompletedAt: "2026-05-20T10:01:00Z",
          },
        ],
        ledgerRows: [],
      }).variance,
    ).toBe(0));
  test("a grandfathered number released before renewal is not subtracted", () =>
    expect(
      report({
        history: [
          {
            ...number(1, "2026-03-15T12:00:00Z"),
            releaseStartedAt: "2026-05-10T10:00:00Z",
            releaseCompletedAt: "2026-05-10T10:01:00Z",
          },
        ],
        ledgerRows: [],
        twilioUsage: [
          usage("phonenumbers-local", 0),
          usage("phonenumbers-setups", 0, "number-setups"),
        ],
      }).variance,
    ).toBe(0));
  test("release across renewal leaves coverage unavailable", () =>
    expect(
      report({
        history: [
          {
            ...number(1, "2026-03-15T12:00:00Z"),
            releaseStartedAt: "2026-05-14T23:59:00Z",
            releaseCompletedAt: "2026-05-15T00:01:00Z",
          },
        ],
        ledgerRows: [],
      }).variance,
    ).toBeNull());
  test("a future number does not cover untracked provider rentals", () =>
    expect(
      report({ history: [number(1, "2026-06-01T00:00:00Z")], ledgerRows: [] })
        .variance,
    ).toBeNull());
  test("provider usage without number history is unavailable", () =>
    expect(report({ history: [] }).variance).toBeNull());
  test("an unknown debit identity is unavailable", () =>
    expect(report({ ledgerRows: [ledger(2)] }).variance).toBeNull());
  test("provider setup coverage must agree with known initial purchases", () =>
    expect(
      report({
        twilioUsage: [
          usage("phonenumbers-local", 1),
          usage("phonenumbers-setups", 1, "number-setups"),
        ],
      }).variance,
    ).toBeNull());
  test("aggregate-only phone usage is unavailable", () =>
    expect(
      report({ twilioUsage: [usage("phonenumbers", 1)] }).variance,
    ).toBeNull());
  test("rental units without a setup record are unavailable", () =>
    expect(
      report({ twilioUsage: [usage("phonenumbers-local", 1)] }).variance,
    ).toBeNull());
  test("duplicate subtype rows are unavailable", () =>
    expect(
      report({
        twilioUsage: [...input().twilioUsage, usage("phonenumbers-local", 1)],
      }).variance,
    ).toBeNull());
  test("a new nonzero phone-number category cannot silently enter the comparison", () =>
    expect(
      report({
        twilioUsage: [
          ...input().twilioUsage,
          usage("phonenumbers-new-rental-type", 1),
        ],
      }).variance,
    ).toBeNull());
  test.each(["number-months", "minutes", "bytes"])(
    "unsupported unit %s stays unavailable",
    (unit) =>
      expect(
        report({
          twilioUsage: [
            usage("phonenumbers-local", 1, unit),
            usage("phonenumbers-setups", 0, "number-setups"),
          ],
        }).variance,
      ).toBeNull(),
  );
  test.each(["", "-1", "1.5", "Infinity", "NaN"])(
    "invalid rental quantity %s stays unavailable",
    (value) =>
      expect(
        report({
          twilioUsage: [
            usage("phonenumbers-local", value),
            usage("phonenumbers-setups", 0, "number-setups"),
          ],
        }).variance,
      ).toBeNull(),
  );
  test.each([0, 100, -150])(
    "invalid debit amount %s stays unavailable",
    (amount) =>
      expect(
        report({ ledgerRows: [ledger(1, "2026-05", undefined, amount)] })
          .variance,
      ).toBeNull(),
  );
  test("provider records for another period are unavailable", () =>
    expect(
      report({
        twilioUsage: input().twilioUsage.map((r) => ({
          ...r,
          startDate: "2026-04-01",
        })),
      }).variance,
    ).toBeNull());
  test("a rolling period cannot compare calendar cycle keys", () =>
    expect(
      report({ period: { startDate: "2026-05-02", endDate: "2026-06-01" } })
        .variance,
    ).toBeNull());
  test("invalid history dates remain unavailable", () =>
    expect(report({ history: [number(1, "unknown")] }).variance).toBeNull());
  test("duplicate history identities remain unavailable", () =>
    expect(report({ history: [number(1), number(1)] }).variance).toBeNull());
  test("completed release without its start time remains unavailable", () =>
    expect(
      report({
        history: [{ ...number(1), releaseCompletedAt: "2026-05-20T12:00:00Z" }],
      }).variance,
    ).toBeNull());
  test("missing provider coverage cannot look balanced when both totals are low", () =>
    expect(report({ history: [number(1), number(2)] }).variance).toBeNull());
  test("the existing text cutoff is preserved for a zoned legacy date", () =>
    expect(
      report({
        history: [number(1, "2026-03-31T23:59:59-04:00")],
        ledgerRows: [],
      }).variance,
    ).toBe(0));
  test("a complete empty month is balanced", () =>
    expect(
      report({ history: [], ledgerRows: [], twilioUsage: [] }),
    ).toMatchObject({ variance: 0, comparisonIssue: null }));
  test("an explicit account coverage failure remains unavailable", () =>
    expect(
      report({
        coverageIssue: "Number account differs from workspace account.",
      }),
    ).toMatchObject({
      variance: null,
      comparisonIssue: "Number account differs from workspace account.",
    }));
  test("month selection is UTC and rolls January into the prior year", () =>
    expect(
      numberRentalReconciliationPeriod(new Date("2026-01-01T00:00:00Z")),
    ).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" }));
  test("month selection handles leap February", () =>
    expect(
      numberRentalReconciliationPeriod(new Date("2028-03-01T00:00:00Z")),
    ).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" }));
  test("anniversary renewals use the month's last day when necessary", () =>
    expect(
      numberRentalDueDate(
        "2026-01-31T12:00:00Z",
        new Date("2026-02-01T00:00:00Z"),
      ).toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z"));
});
