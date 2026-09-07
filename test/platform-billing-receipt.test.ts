import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: new Proxy({}, { get: (_target: unknown, prop: string) => () => `test-${prop}` }),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const sessionsRetrieve = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { retrieve: sessionsRetrieve } };
  },
}));

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/transaction-history.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transaction-history.server")>()),
  insertTransactionHistoryIdempotent: vi.fn(),
}));
vi.mock("@/server/admin-db", () => ({ adminDb: {} }));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({ transaction_history: { findFirst } })),
}));
vi.mock("@/lib/database/stripe.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/stripe.server")>()),
  createStripeContact: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: vi.fn(),
}));

const WORKSPACE_ID = "c519a538-de2b-4957-84fb-f1fd9171e01d";

async function receipt(transactionId = 7) {
  const mod = await import("../app/lib/platform-billing.server");
  return mod.getPurchaseReceiptUrl({ userId: "u1", workspaceId: WORKSPACE_ID, transactionId });
}

describe("getPurchaseReceiptUrl (#1322)", () => {
  beforeEach(() => {
    sessionsRetrieve.mockReset();
    findFirst.mockReset();
  });

  test("resolves the hosted invoice for a Stripe purchase in this workspace", async () => {
    findFirst.mockResolvedValue({ id: 7, type: "CREDIT", idempotency_key: "stripe_session:cs_test_1", note: "Added 500 credits" });
    sessionsRetrieve.mockResolvedValue({
      metadata: { workspaceId: WORKSPACE_ID },
      invoice: { hosted_invoice_url: "https://invoice.stripe.com/i/abc" },
      payment_intent: { latest_charge: { receipt_url: "https://pay.stripe.com/receipts/xyz" } },
    });
    await expect(receipt()).resolves.toEqual({ ok: true, url: "https://invoice.stripe.com/i/abc" });
    expect(sessionsRetrieve).toHaveBeenCalledWith("cs_test_1", { expand: ["payment_intent.latest_charge", "invoice"] });
  });

  test("falls back to the charge receipt, and finds the session id in the note for event-keyed rows", async () => {
    findFirst.mockResolvedValue({ id: 7, type: "CREDIT", idempotency_key: "stripe_evt:evt_1", note: "Added 500 credits, stripe_session:cs_test_2" });
    sessionsRetrieve.mockResolvedValue({
      metadata: { workspaceId: WORKSPACE_ID },
      invoice: null,
      payment_intent: { latest_charge: { receipt_url: "https://pay.stripe.com/receipts/xyz" } },
    });
    await expect(receipt()).resolves.toEqual({ ok: true, url: "https://pay.stripe.com/receipts/xyz" });
    expect(sessionsRetrieve).toHaveBeenCalledWith("cs_test_2", expect.anything());
  });

  test("a ledger row outside this workspace (tenant db finds nothing) is a 404 without calling Stripe", async () => {
    findFirst.mockResolvedValue(null);
    await expect(receipt(99)).resolves.toMatchObject({ ok: false, status: 404 });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  test("usage rows never have receipts", async () => {
    findFirst.mockResolvedValue({ id: 7, type: "DEBIT", idempotency_key: "sms:SM1", note: null });
    await expect(receipt()).resolves.toMatchObject({ ok: false, status: 404 });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  test("a session whose metadata names another workspace is refused", async () => {
    findFirst.mockResolvedValue({ id: 7, type: "CREDIT", idempotency_key: "stripe_session:cs_test_3", note: null });
    sessionsRetrieve.mockResolvedValue({ metadata: { workspaceId: "other" }, invoice: null, payment_intent: null });
    await expect(receipt()).resolves.toMatchObject({ ok: false, status: 403 });
  });

  test("a provider outage is a 502, not a crash", async () => {
    findFirst.mockResolvedValue({ id: 7, type: "CREDIT", idempotency_key: "stripe_session:cs_test_4", note: null });
    sessionsRetrieve.mockRejectedValue(new Error("connect ETIMEDOUT"));
    await expect(receipt()).resolves.toMatchObject({ ok: false, status: 502 });
  });
});
