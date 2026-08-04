import { describe, expect, test } from "vitest";

import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  categorizeLedgerRow,
  filterLedgerRowsInPeriod,
  hasMaterialBillingVariance,
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
        // One 4-credit staffed call = one started minute. Twilio reports 45
        // minutes, so the variance is 44 — measured minutes against minutes,
        // not minutes against a count of ledger rows.
        billedVoiceMinutes: 1,
      },
    });

    expect(report.categories.sms.variance).toBe(118);
    expect(report.categories.voice.variance).toBe(44);
    expect(report.categories.numbers.variance).toBe(1);
    expect(report.entityAudit.messageGap).toBe(116);
    expect(report.ledgerCreditPurchases).toBe(500);
    expect(hasMaterialBillingVariance(report)).toBe(true);
    const snapshot = buildBillingReconciliationSnapshot(report, "admin");
    expect(snapshot.materialVariance).toBe(true);
    expect(snapshot.smsVariance).toBe(118);
  });

  test("SMS variance measures segments to segments, not rows to segments", () => {
    // Regression: a multi-segment SMS creates a ledger row, so old code comparing
    // event count (1 row) to Twilio segments (3) would report false drift even with
    // perfect balance. New code compares credits (3, since SMS_SEGMENT_CREDITS is 1)
    // to segments (3), which correctly shows variance of 0.
    const ledgerRows = [
      {
        type: "DEBIT",
        amount: -1, // one-segment SMS = 1 credit
        idempotency_key: "sms:SM1",
        created_at: "2026-05-10T12:00:00.000Z",
      },
      {
        type: "DEBIT",
        amount: -3, // three-segment SMS = 3 credits
        idempotency_key: "sms:SM2",
        created_at: "2026-05-11T12:00:00.000Z",
      },
    ];

    const report = buildBillingReconciliationReport({
      period,
      twilioUsage: [
        {
          category: "sms-outbound",
          description: "SMS",
          usage: "4", // Twilio reports 4 segments total
          usageUnit: "segments",
          price: "0.06",
        },
      ],
      ledgerRows,
      entityAudit: {
        billableMessages: 2,
        debitedMessages: 2,
        messageGap: 0,
        billableCalls: 0,
        debitedCalls: 0,
        callGap: 0,
        billedVoiceMinutes: 0,
      },
    });

    // Correct: variance is 0 (4 segments - 4 credits).
    // Broken: would be 2 (4 segments - 2 rows) if using event count.
    expect(report.categories.sms.variance).toBe(0);
    expect(report.categories.sms.ledgerCredits).toBe(4);
    expect(report.categories.sms.ledgerEvents).toBe(2);
  });

  test("voice variance measures minutes to minutes, not rows to minutes", () => {
    // Regression: a single long call has one ledger row but many minutes. Old code
    // comparing event count (1) to Twilio minutes (10) would report 9 minutes of
    // false drift. New code compares billedVoiceMinutes (10) to minutes (10),
    // which correctly shows variance of 0.
    const ledgerRows = [
      {
        type: "DEBIT",
        amount: -10, // 10-minute staffed call = 10 credits (1 per minute)
        idempotency_key: "call:CA1",
        created_at: "2026-05-10T12:00:00.000Z",
      },
    ];

    const report = buildBillingReconciliationReport({
      period,
      twilioUsage: [
        {
          category: "calls-outbound",
          description: "Calls",
          usage: "10", // Twilio reports 10 minutes
          usageUnit: "minutes",
          price: "1.70",
        },
      ],
      ledgerRows,
      entityAudit: {
        billableMessages: 0,
        debitedMessages: 0,
        messageGap: 0,
        billableCalls: 1,
        debitedCalls: 1,
        callGap: 0,
        billedVoiceMinutes: 10, // This call billed for 10 started minutes
      },
    });

    // Correct: variance is 0 (10 minutes - 10 minutes).
    // Broken: would be 9 (10 minutes - 1 row) if using event count.
    expect(report.categories.voice.variance).toBe(0);
    expect(report.categories.voice.ledgerEvents).toBe(1);
  });
});
