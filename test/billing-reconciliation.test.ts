import { describe, expect, test } from "vitest";

import {
  buildBillingReconciliationReport,
  categorizeLedgerRow,
  filterLedgerRowsInPeriod,
  summarizeLedger,
  type TwilioUsageRecord,
} from "../shared/billing-reconciliation";

describe("billing-reconciliation", () => {
  const period = { startDate: "2026-05-01", endDate: "2026-05-31" };

  const twilioUsage: TwilioUsageRecord[] = [
    {
      category: "sms-outbound",
      description: "SMS",
      usage: "120",
      usageUnit: "segments",
      price: "1.80",
    },
    {
      category: "calls-outbound",
      description: "Calls",
      usage: "45",
      usageUnit: "minutes",
      price: "0.85",
    },
    {
      category: "phonenumbers-local",
      description: "Numbers",
      usage: "2",
      usageUnit: "number-months",
      price: "2.00",
    },
  ];

  test("categorizes ledger rows by idempotency key prefix", () => {
    expect(
      categorizeLedgerRow({
        type: "DEBIT",
        amount: -1,
        idempotency_key: "sms:SM123",
        created_at: "2026-05-10T12:00:00.000Z",
      }).bucket,
    ).toBe("sms");
    expect(
      categorizeLedgerRow({
        type: "DEBIT",
        amount: -5,
        idempotency_key: "call:CA123",
        created_at: "2026-05-10T12:00:00.000Z",
      }).bucket,
    ).toBe("voice");
    expect(
      categorizeLedgerRow({
        type: "CREDIT",
        amount: 500,
        idempotency_key: "stripe_evt:evt_1",
        created_at: "2026-05-10T12:00:00.000Z",
      }).bucket,
    ).toBe("purchase");
  });

  test("filters ledger rows to reconciliation period", () => {
    const rows = filterLedgerRowsInPeriod(
      [
        {
          type: "DEBIT",
          amount: -1,
          idempotency_key: "sms:SM1",
          created_at: "2026-05-10T12:00:00.000Z",
        },
        {
          type: "DEBIT",
          amount: -1,
          idempotency_key: "sms:SM2",
          created_at: "2026-06-01T12:00:00.000Z",
        },
      ],
      period,
    );
    expect(rows).toHaveLength(1);
  });

  test("builds variance report from Twilio usage and ledger rows", () => {
    const ledgerRows = [
      {
        type: "DEBIT",
        amount: -1,
        idempotency_key: "sms:SM1",
        created_at: "2026-05-10T12:00:00.000Z",
      },
      {
        type: "DEBIT",
        amount: -1,
        idempotency_key: "sms:SM2",
        created_at: "2026-05-11T12:00:00.000Z",
      },
      {
        type: "DEBIT",
        amount: -4,
        idempotency_key: "call:CA1",
        created_at: "2026-05-12T12:00:00.000Z",
      },
      {
        type: "DEBIT",
        amount: -100,
        idempotency_key: "number_rent:42:2026-05",
        created_at: "2026-05-15T12:00:00.000Z",
      },
      {
        type: "CREDIT",
        amount: 500,
        idempotency_key: "stripe_evt:evt_1",
        created_at: "2026-05-01T12:00:00.000Z",
      },
    ];

    const summary = summarizeLedger(filterLedgerRowsInPeriod(ledgerRows, period));
    expect(summary.sms.events).toBe(2);
    expect(summary.voice.events).toBe(1);
    expect(summary.numbers.events).toBe(1);
    expect(summary.purchase.credits).toBe(500);

    const report = buildBillingReconciliationReport({
      period,
      twilioUsage,
      ledgerRows,
      entityAudit: {
        billableMessages: 118,
        debitedMessages: 2,
        messageGap: 116,
        billableCalls: 1,
        debitedCalls: 1,
        callGap: 0,
      },
    });

    expect(report.categories.sms.variance).toBe(118);
    expect(report.categories.voice.variance).toBe(44);
    expect(report.categories.numbers.variance).toBe(1);
    expect(report.entityAudit.messageGap).toBe(116);
    expect(report.ledgerCreditPurchases).toBe(500);
  });
});
