import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", () => {
  const handler = { get: (_target: unknown, prop: string) => () => `test-${prop}` };
  return { env: new Proxy({}, handler) };
});

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const sessionsRetrieve = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { retrieve: sessionsRetrieve } };
  },
}));

const insertTransactionHistoryIdempotent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent,
}));

vi.mock("@/server/admin-db", () => ({ adminDb: {} }));
vi.mock("@/server/tenant-db", () => ({ createTenantDb: vi.fn() }));
vi.mock("@/lib/database/stripe.server", () => ({ createStripeContact: vi.fn() }));
vi.mock("@/lib/database/workspace.server", () => ({ requireWorkspaceAccess: vi.fn() }));

const WORKSPACE_ID = "c519a538-de2b-4957-84fb-f1fd9171e01d";
const SESSION_ID = "cs_test_abc123";

async function confirm() {
  const mod = await import("../app/lib/platform-billing.server");
  return mod.confirmStripeCheckoutSessionForRedirect({ sessionId: SESSION_ID });
}

describe("confirmStripeCheckoutSessionForRedirect", () => {
  beforeEach(() => {
    sessionsRetrieve.mockReset();
    insertTransactionHistoryIdempotent.mockReset();
  });

  test("credits the workspace when the session is complete", async () => {
    sessionsRetrieve.mockResolvedValue({
      status: "complete",
      metadata: { workspaceId: WORKSPACE_ID, creditAmount: "500" },
    });
    insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true });

    const result = await confirm();

    expect(result).toMatchObject({
      ok: true,
      workspaceId: WORKSPACE_ID,
      creditAmount: 500,
    });
  });

  // The ledger insert is what fails when a deployed database is behind on
  // migrations (e.g. an apply_ledger_entry_and_sync_credits that inserts the
  // text p_type into the transaction_type enum column without a cast). The
  // caller must still be able to send the user back to their own billing page.
  test("keeps the workspace id when the ledger insert throws", async () => {
    sessionsRetrieve.mockResolvedValue({
      status: "complete",
      metadata: { workspaceId: WORKSPACE_ID, creditAmount: "500" },
    });
    insertTransactionHistoryIdempotent.mockRejectedValue(
      new Error('column "type" is of type transaction_type'),
    );

    const result = await confirm();

    expect(result.ok).toBe(false);
    expect(result.workspaceId).toBe(WORKSPACE_ID);
  });

  // Regression: `fallbackWorkspaceId` used to be assigned *after* this throw,
  // so an incomplete payment lost the workspace and stranded the user on the
  // workspace list with a context-free error instead of their billing page.
  test("keeps the workspace id when the payment is not complete", async () => {
    sessionsRetrieve.mockResolvedValue({
      status: "open",
      metadata: { workspaceId: WORKSPACE_ID, creditAmount: "500" },
    });

    const result = await confirm();

    expect(result.ok).toBe(false);
    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("keeps the workspace id when credit metadata is missing", async () => {
    sessionsRetrieve.mockResolvedValue({
      status: "complete",
      metadata: { workspaceId: WORKSPACE_ID },
    });

    const result = await confirm();

    expect(result.ok).toBe(false);
    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("reports no workspace when the session cannot be retrieved", async () => {
    sessionsRetrieve.mockRejectedValue(new Error("no such session"));

    const result = await confirm();

    expect(result.ok).toBe(false);
    expect(result.workspaceId).toBeNull();
  });
});
