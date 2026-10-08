import { describe, expect, test } from "vitest";
import {
  buildBillingReconciliationAlertDetails,
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  hasMaterialBillingVariance,
  type TwilioUsageRecord,
} from "../shared/billing-reconciliation";

const period = { startDate: "2026-09-06", endDate: "2026-10-06" };
function usage(overrides: Partial<TwilioUsageRecord> = {}): TwilioUsageRecord {
  return {
    category: "totalprice",
    description: "All usage",
    usage: "4.20",
    usageUnit: "usd",
    price: "4.20",
    priceUnit: "usd",
    ...period,
    ...overrides,
  };
}
function report(twilioUsage: TwilioUsageRecord[]) {
  return buildBillingReconciliationReport({
    period,
    twilioUsage,
    ledgerRows: [],
    entityAudit: {
      billableMessages: 0,
      debitedMessages: 0,
      messageGap: 0,
      billableCalls: 0,
      debitedCalls: 0,
      callGap: 0,
      billedVoiceMinutes: 0,
    },
    numberRentals: {
      period: { startDate: "2026-09-01", endDate: "2026-09-30" },
      twilioUsage: [],
      ledgerRows: [],
      history: [],
    },
  });
}
const rentalSubset = [
  usage({ category: "phonenumbers", price: "4.20" }),
  usage({ category: "phonenumbers-local", price: "3.45" }),
  usage({ category: "phonenumbers-emergency", price: "0.75" }),
];

describe("full-account provider cost (#2426)", () => {
  test("the provider total takes precedence over overlapping rental categories", () => {
    expect(report([usage(), ...rentalSubset]).twilioTotalCostUsd).toBe(4.2);
  });
  test("category coverage alone cannot establish a full-account total", () => {
    expect(report(rentalSubset).twilioTotalCostUsd).toBeNull();
  });
  test("an empty response is unknown rather than a verified zero", () => {
    expect(report([]).twilioTotalCostUsd).toBeNull();
  });
  test("costs outside the listed categories remain in the provider total", () => {
    expect(
      report([usage({ price: "9.25" }), ...rentalSubset]).twilioTotalCostUsd,
    ).toBe(9.25);
  });
  test("zero does not fall back to category prices", () => {
    expect(
      report([usage({ price: "0" }), ...rentalSubset]).twilioTotalCostUsd,
    ).toBe(0);
  });
  test("duplicate total coverage is unknown even when the values agree", () => {
    expect(report([usage(), usage()]).twilioTotalCostUsd).toBeNull();
  });
  test.each([
    { name: "empty", price: "" },
    { name: "whitespace", price: "  " },
    { name: "trailing text", price: "4.20 USD" },
    { name: "NaN", price: "NaN" },
    { name: "infinity", price: "Infinity" },
    { name: "hexadecimal", price: "0x10" },
    { name: "overflow", price: "1e999" },
  ])("rejects $name price coverage", ({ price }) => {
    expect(
      report([usage({ price }), ...rentalSubset]).twilioTotalCostUsd,
    ).toBeNull();
  });
  test.each([
    { name: "missing", priceUnit: undefined },
    { name: "Euro", priceUnit: "eur" },
    { name: "empty", priceUnit: "" },
  ])("rejects $name currency coverage", ({ priceUnit }) => {
    expect(
      report([usage({ priceUnit }), ...rentalSubset]).twilioTotalCostUsd,
    ).toBeNull();
  });
  test.each([
    { name: "missing start", startDate: undefined },
    { name: "missing end", endDate: undefined },
    { name: "old start", startDate: "2026-09-05" },
    { name: "future end", endDate: "2026-10-07" },
    { name: "malformed start", startDate: "2026-09-06garbage" },
    { name: "offset start", startDate: "2026-09-06T00:00:00+05:00" },
  ])("rejects $name period coverage", ({ name: _name, ...dates }) => {
    expect(
      report([usage(dates), ...rentalSubset]).twilioTotalCostUsd,
    ).toBeNull();
  });
  test.each([
    {
      name: "SDK UTC dates",
      startDate: "2026-09-06T00:00:00.000Z",
      endDate: "2026-10-06T00:00:00.000Z",
      price: "4.20",
      priceUnit: "usd",
      expected: 4.2,
    },
    {
      name: "uppercase ISO currency",
      priceUnit: "USD",
      price: "4.20",
      expected: 4.2,
    },
    {
      name: "small decimal",
      price: "1e-7",
      priceUnit: "usd",
      expected: 0.0000001,
    },
    {
      name: "signed provider credit",
      price: "-1.25",
      priceUnit: "usd",
      expected: -1.25,
    },
  ])("retains valid $name", ({ name: _name, expected, ...values }) => {
    expect(report([usage(values)]).twilioTotalCostUsd).toBe(expected);
  });
  test.each([
    { name: "known", records: [usage()], expected: 4.2 },
    { name: "zero", records: [usage({ price: "0" })], expected: 0 },
    { name: "unknown", records: rentalSubset, expected: null },
  ])(
    "alert details retain the $name total and period",
    ({ records, expected }) => {
      const result = report(records);
      const details = JSON.parse(
        JSON.stringify(buildBillingReconciliationAlertDetails(result)),
      );
      expect(details.twilioTotalCostUsd).toBe(expected);
      expect(details.period).toEqual({
        startDate: "2026-09-06",
        endDate: "2026-10-06",
      });
      expect(result.ledgerDebitCredits).toBe(0);
      expect(hasMaterialBillingVariance(result)).toBe(false);
      expect(
        buildBillingReconciliationSnapshot(result, "admin").materialVariance,
      ).toBe(false);
    },
  );
});
