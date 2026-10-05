import { describe, expect, test } from "vitest";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS } from "../shared/pricing";
import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  hasMaterialBillingVariance,
  type LedgerTransactionRow,
  type TwilioUsageRecord,
} from "../shared/billing-reconciliation";
import { normalizeBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";

const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
const emptyAudit = {
  billableMessages: 0,
  debitedMessages: 0,
  messageGap: 0,
  billableCalls: 0,
  debitedCalls: 0,
  callGap: 0,
  billedVoiceMinutes: 0,
};
function debit(
  kind: "SMS" | "MMS",
  sid: string,
  units = 1,
): LedgerTransactionRow {
  return {
    type: "DEBIT",
    amount: -(kind === "MMS" ? MMS_CREDITS : SMS_SEGMENT_CREDITS * units),
    idempotency_key: `sms:${sid}`,
    note: `${kind} ${sid} delivered`,
    message_sid: sid,
    created_at: "2026-05-10T12:00:00.000Z",
  };
}
function usage(
  category: string,
  units: string | number,
  usageUnit = "messages",
): TwilioUsageRecord {
  return {
    category,
    usage: String(units),
    usageUnit,
    description: category,
    price: "0.01",
  };
}
function report(
  ledgerRows: LedgerTransactionRow[],
  twilioUsage: TwilioUsageRecord[],
) {
  return buildBillingReconciliationReport({
    period,
    ledgerRows,
    twilioUsage,
    entityAudit: emptyAudit,
  });
}

describe("separate SMS segments and MMS messages (#2112)", () => {
  test("one SMS reconciles in provider billing messages", () => {
    const result = report([debit("SMS", "SM1")], [usage("sms-outbound", 1)]);
    expect(result.categories.sms.variance).toBe(0);
    expect(result.categories.sms.ledgerCredits).toBe(2);
    expect(hasMaterialBillingVariance(result)).toBe(false);
  });
  test("a two-segment SMS retains SMS kind despite costing the same as one MMS", () => {
    const result = report([debit("SMS", "SM2", 2)], [usage("sms-outbound", 2)]);
    expect(result.categories.sms).toMatchObject({
      variance: 0,
      ledgerEvents: 1,
      ledgerCredits: 4,
    });
    expect(result.categories.mms).toMatchObject({
      variance: 0,
      ledgerEvents: 0,
      ledgerCredits: 0,
    });
  });
  test("pure MMS reconciles as messages without phantom SMS segments", () => {
    const result = report([debit("MMS", "MM1")], [usage("mms-outbound", 1)]);
    expect(result.categories.sms).toMatchObject({
      variance: 0,
      ledgerCredits: 0,
      ledgerEvents: 0,
    });
    expect(result.categories.mms).toMatchObject({
      variance: 0,
      ledgerCredits: 4,
      ledgerEvents: 1,
      twilioUnitLabel: "messages",
    });
    expect(hasMaterialBillingVariance(result)).toBe(false);
  });
  test("mixed three-segment SMS and two MMS reconcile without false drift", () => {
    const result = report(
      [debit("SMS", "SM3", 3), debit("MMS", "MM1"), debit("MMS", "MM2")],
      [usage("sms-outbound", 3), usage("mms-outbound", 2)],
    );
    expect(result.categories.sms).toMatchObject({
      variance: 0,
      ledgerCredits: 6,
      ledgerEvents: 1,
    });
    expect(result.categories.mms).toMatchObject({
      variance: 0,
      ledgerCredits: 8,
      ledgerEvents: 2,
    });
    expect(result.ledgerDebitCredits).toBe(14);
    expect(hasMaterialBillingVariance(result)).toBe(false);
  });
  test.each(["sms", "mms"] as const)(
    "%s aggregate is not added to its subtypes",
    (kind) => {
      const result = report(
        [debit(kind === "sms" ? "SMS" : "MMS", "M1", kind === "sms" ? 3 : 1)],
        [
          usage(`${kind}-outbound`, kind === "sms" ? 3 : 1),
          usage(`${kind}-outbound-longcode`, kind === "sms" ? 3 : 1),
          usage(`${kind}-outbound-shortcode`, 0),
        ],
      );
      expect(result.categories[kind].variance).toBe(0);
      expect(result.categories[kind].twilioUnits).toBe(kind === "sms" ? 3 : 1);
    },
  );
  test.each(["sms", "mms"] as const)(
    "%s long-code and short-code leaves reconcile when aggregate is absent",
    (kind) => {
      const result = report(
        [
          debit(kind === "sms" ? "SMS" : "MMS", "M1"),
          debit(kind === "sms" ? "SMS" : "MMS", "M2"),
        ],
        [
          usage(`${kind}-outbound-longcode`, 1),
          usage(`${kind}-outbound-shortcode`, 1),
        ],
      );
      expect(result.categories[kind].variance).toBe(0);
      expect(result.categories[kind].twilioUnits).toBe(2);
    },
  );
  test("inbound, carrier fees and Authy records do not add outbound units", () => {
    const result = report(
      [],
      [
        usage("sms-inbound", 9),
        usage("mms-inbound", 8),
        usage("sms", 9),
        usage("mms", 8),
        usage("authy-sms-outbound", 7),
        usage("sms-messages-carrierfees", 6),
        usage("mms-messages-carrierfees", 5),
      ],
    );
    expect(result.categories.sms.variance).toBe(0);
    expect(result.categories.mms.variance).toBe(0);
    expect(hasMaterialBillingVariance(result)).toBe(false);
  });
  test.each([
    null,
    "",
    "MMS WRONG delivered",
    "SMS SM1",
    "Message SM1 delivered",
  ])("unverified note %s cannot silently become SMS", (note) => {
    const result = report([{ ...debit("SMS", "SM1", 2), note }], []);
    expect(result.categories.sms.ledgerEvents).toBe(0);
    expect(result.categories.mms.ledgerEvents).toBe(0);
    expect(result.unrecognizedDebitEvents).toBe(1);
    expect(result.ledgerDebitCredits).toBe(4);
    expect(hasMaterialBillingVariance(result)).toBe(true);
  });
  test("a conflicting saved message SID rejects the marker", () => {
    const result = report(
      [{ ...debit("MMS", "MM1"), message_sid: "OTHER" }],
      [],
    );
    expect(result.unrecognizedDebitEvents).toBe(1);
    expect(hasMaterialBillingVariance(result)).toBe(true);
  });
  test("a historical marker still identifies kind without a saved message SID", () => {
    const result = report(
      [{ ...debit("MMS", "MM1"), message_sid: null }],
      [usage("mms-outbound", 1)],
    );
    expect(result.categories.mms.variance).toBe(0);
    expect(result.unrecognizedDebitEvents).toBe(0);
  });
  test.each(["sms", "mms"] as const)(
    "unsupported %s units stay unavailable in the persisted snapshot",
    (kind) => {
      const result = report([], [usage(`${kind}-outbound`, 0, "bytes")]);
      expect(result.categories[kind].twilioUnits).toBeNull();
      expect(result.categories[kind].variance).toBeNull();
      expect(hasMaterialBillingVariance(result)).toBe(true);
      const snapshot = buildBillingReconciliationSnapshot(result, "cron");
      const normalized = normalizeBillingReconciliationSnapshot(
        JSON.parse(JSON.stringify(snapshot)),
      );
      expect(
        normalized?.[kind === "sms" ? "smsVariance" : "mmsVariance"],
      ).toBeNull();
      expect(normalized?.materialVariance).toBe(true);
    },
  );
  test.each(["3x", "", "-1", "1.5", "Infinity"])(
    "invalid quantity %s is unavailable instead of balanced",
    (quantity) => {
      const result = report([], [usage("mms-outbound", quantity)]);
      expect(result.categories.mms.variance).toBeNull();
      expect(hasMaterialBillingVariance(result)).toBe(true);
    },
  );
  test.each(["sms", "mms"] as const)(
    "duplicate %s totals cannot establish balance",
    (kind) => {
      const result = report(
        [],
        [usage(`${kind}-outbound`, 0), usage(`${kind}-outbound`, 0)],
      );
      expect(result.categories[kind].variance).toBeNull();
    },
  );
  test("an unknown outbound leaf cannot establish complete coverage", () => {
    const result = report([], [usage("mms-outbound-newtype", 0)]);
    expect(result.categories.mms.variance).toBeNull();
    expect(hasMaterialBillingVariance(result)).toBe(true);
  });
  test("MMS drift reaches the material flag and snapshot", () => {
    const result = report([], [usage("mms-outbound", 3)]);
    expect(result.categories.mms.variance).toBe(3);
    expect(hasMaterialBillingVariance(result)).toBe(true);
    expect(buildBillingReconciliationSnapshot(result, "admin")).toMatchObject({
      mmsVariance: 3,
      smsVariance: 0,
      materialVariance: true,
    });
  });
  test("out-of-period MMS is excluded before kind classification", () => {
    const result = report(
      [{ ...debit("MMS", "MM1"), created_at: "2026-04-30T23:59:59.999Z" }],
      [],
    );
    expect(result.categories.mms.ledgerEvents).toBe(0);
    expect(result.ledgerDebitCredits).toBe(0);
    expect(result.unrecognizedDebitEvents).toBe(0);
  });
  test("legacy snapshots without MMS remain readable", () => {
    expect(
      normalizeBillingReconciliationSnapshot({
        lastRunAt: "2026-05-31T12:00:00.000Z",
        period,
        smsVariance: 0,
        materialVariance: false,
      }),
    ).toMatchObject({
      smsVariance: 0,
      mmsVariance: 0,
      materialVariance: false,
    });
  });
});
