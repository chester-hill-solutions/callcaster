import { describe, expect, test } from "vitest";

import {
  getBillingEventSource,
  getBillingEventSourceLabel,
} from "../app/lib/transaction-history-display";
import { bucketFromIdempotencyKey } from "../shared/billing-keys";
import { categorizeLedgerRow } from "../shared/billing-reconciliation";

const grantKeys = [
  "welcome-credits:workspace-2060",
  "manual-credit:workspace-2060:nonce-2060",
];

describe("grant classification through the public adapters (#2060)", () => {
  test.each(grantKeys)("a CREDIT with %s displays and reconciles as purchase", (key) => {
    // The key describes a grant. Transaction type supplies the reporting
    // category; the prefix-only helper must keep its intentional other bucket.
    expect(bucketFromIdempotencyKey(key)).toBe("other");
    const source = getBillingEventSource({ type: "CREDIT", idempotencyKey: key });
    expect(source).toBe("purchase");
    expect(getBillingEventSourceLabel(source)).toBe("Purchase");
    expect(categorizeLedgerRow({
      type: "CREDIT", amount: 250, idempotency_key: key,
      created_at: "2026-10-21T00:00:00.000Z",
    })).toEqual({ bucket: "purchase", credits: 250 });
  });

  test.each(grantKeys)("a DEBIT with %s does not become a purchase from its prefix", (key) => {
    // This control catches an unconditional prefix-to-purchase mapping that
    // would make the credit cases pass while changing the grant-key contract.
    expect(getBillingEventSource({ type: "DEBIT", idempotencyKey: key })).toBe("unknown");
    expect(categorizeLedgerRow({
      type: "DEBIT", amount: -250, idempotency_key: key,
      created_at: "2026-10-21T00:00:00.000Z",
    })).toEqual({ bucket: "other", credits: 250 });
  });
});
