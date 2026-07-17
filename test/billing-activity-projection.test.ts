import { describe, expect, test } from "vitest";

import {
  formatSignedCreditAmount,
  projectBillingActivity,
} from "../app/lib/billing-activity-projection";

describe("billing activity projection", () => {
  test.each([
    {
      name: "purchase",
      row: {
        id: "1",
        created_at: "2026-07-16T12:00:00.000Z",
        type: "CREDIT",
        amount: 500,
        note: "Added 500 credits, stripe_session:cs_test_123",
        idempotency_key: "stripe_session:cs_test_123",
      },
      activity: "Credit purchase",
      provider: "Stripe",
      reference: "cs_test_123",
    },
    {
      name: "welcome credits",
      row: {
        id: "2",
        created_at: "2026-07-16T12:00:00.000Z",
        type: "CREDIT",
        amount: 100,
        note: "Welcome bonus: 100 free credits to get started",
        idempotency_key:
          "welcome-credits:11111111-1111-1111-1111-111111111111",
      },
      activity: "Welcome credits",
      provider: "CallCaster",
      reference: "11111111-1111-1111-1111-111111111111",
    },
    {
      name: "SMS",
      row: {
        id: "3",
        created_at: "2026-07-16T12:00:00.000Z",
        type: "DEBIT",
        amount: -2,
        note: "SMS SM123 delivered (2 segments)",
        idempotency_key: "sms:SM123",
      },
      activity: "SMS messaging",
      provider: "Twilio",
      reference: "SM123",
    },
    {
      name: "voice",
      row: {
        id: "4",
        created_at: "2026-07-16T12:00:00.000Z",
        type: "DEBIT",
        amount: -4,
        note: "Call CA123 (API/staffed dial)",
        idempotency_key: "call:CA123",
      },
      activity: "Voice calling",
      provider: "Twilio",
      reference: "CA123",
    },
    {
      name: "rental",
      row: {
        id: "5",
        created_at: "2026-07-16T12:00:00.000Z",
        type: "DEBIT",
        amount: -100,
        note: "Monthly rental for +14165550123",
        idempotency_key: "number_rent:42:2026-07",
      },
      activity: "Phone number rental",
      provider: "CallCaster",
      reference: "42 · 2026-07",
    },
  ])("projects $name into customer-facing activity", ({ row, ...expected }) => {
    const projection = projectBillingActivity(row);

    expect(projection.activity).toBe(expected.activity);
    expect(projection.advanced.provider).toBe(expected.provider);
    expect(projection.advanced.reference).toBe(expected.reference);
    expect(projection.advanced.idempotencyKey).toBe(row.idempotency_key);
    expect(projection.advanced.rawNote).toBe(row.note);
  });

  test("projects a keyless debit as an adjustment", () => {
    const projection = projectBillingActivity({
      id: "6",
      created_at: "2026-07-16T12:00:00.000Z",
      type: "DEBIT",
      amount: -10,
      note: "Manual correction",
      idempotency_key: null,
    });

    expect(projection.activity).toBe("Credit adjustment");
    expect(projection.advanced.provider).toBe("CallCaster");
    expect(projection.advanced.reference).toBeNull();
  });

  test("keeps an unknown note out of the default activity label", () => {
    const projection = projectBillingActivity({
      id: "7",
      created_at: "2026-07-16T12:00:00.000Z",
      type: "DEBIT",
      amount: -3,
      note: "opaque provider payload",
      idempotency_key: "future-provider:abc",
    });

    expect(projection.activity).toBe("Credit usage");
    expect(projection.activity).not.toContain("opaque provider payload");
    expect(projection.advanced.rawNote).toBe("opaque provider payload");
    expect(projection.advanced.provider).toBe("Other");
    expect(projection.advanced.reference).toBeNull();
  });

  test("rejects malformed known references while preserving support data", () => {
    const projection = projectBillingActivity({
      id: "8",
      created_at: "2026-07-16T12:00:00.000Z",
      type: "DEBIT",
      amount: -1,
      note: null,
      idempotency_key: "sms:",
    });

    expect(projection.advanced.reference).toBeNull();
    expect(projection.advanced.idempotencyKey).toBe("sms:");
  });
});

describe("signed credit amount formatting", () => {
  test.each([
    ["CREDIT", 1250, "+1,250 credits"],
    ["CREDIT", -25, "+25 credits"],
    ["DEBIT", -3, "−3 credits"],
    ["DEBIT", 4, "−4 credits"],
  ] as const)("formats %s %s", (type, amount, expected) => {
    expect(formatSignedCreditAmount(type, amount)).toBe(expected);
  });
});
