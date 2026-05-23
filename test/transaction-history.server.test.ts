import { describe, expect, test } from "vitest";

import { getTransactionDisplayDescription } from "../app/lib/transaction-history.server";

describe("transaction-history display helpers", () => {
  test("removes internal Stripe markers from user-facing credit descriptions", () => {
    expect(
      getTransactionDisplayDescription({
        type: "CREDIT",
        amount: 250,
        note: "Added 250 credits, stripe_session:sess_123 [idempotency:stripe_session:sess_123]",
      }),
    ).toBe("Added 250 credits");
  });

  test("falls back to readable defaults when note is empty", () => {
    expect(
      getTransactionDisplayDescription({
        type: "DEBIT",
        amount: 10,
        note: "",
      }),
    ).toBe("Used 10 credits");
  });

  test("falls back to credit default when note is omitted", () => {
    expect(
      getTransactionDisplayDescription({
        type: "CREDIT",
        amount: 5,
      }),
    ).toBe("Added 5 credits");
  });

  test("returns cleaned user note when only idempotency marker is present", () => {
    expect(
      getTransactionDisplayDescription({
        type: "DEBIT",
        amount: 1,
        note: "Manual adjustment [idempotency:abc123]",
      }),
    ).toBe("Manual adjustment");
  });
});
