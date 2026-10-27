import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemberRole } from "../app/lib/member-role";

vi.stubEnv("ENV", "local");
vi.stubEnv("NODE_ENV", "test");

const requireWorkspaceAccess = vi.hoisted(() => vi.fn());
const dbExecute = vi.hoisted(() => vi.fn());
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess,
}));
vi.mock("@/server/admin-db", () => ({ adminDb: {} }));
vi.mock("@/server/db", () => ({ db: { execute: dbExecute } }));
vi.mock("@/server/tenant-db", () => ({ createTenantDb: vi.fn() }));
vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: new Proxy({}, { get: () => () => "unused" }),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitTransactionHistoryInsertEvent: vi.fn(),
}));

const workspaceId = "workspace-local-checkout";
const userId = "billing-admin";

describe("local mock checkout lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    requireWorkspaceAccess.mockReset().mockResolvedValue(undefined);
    dbExecute.mockReset();
  });

  test("does not grant an open session; an authorized completion grants through the stable ledger key", async () => {
    const billing = await import("../app/lib/platform-billing.server");
    dbExecute
      .mockResolvedValueOnce([{ id: 1, inserted: true, amount: 500, type: "CREDIT", idempotency_key: `stripe_session:mock`, workspace: workspaceId }])
      .mockResolvedValueOnce([{ id: 1, inserted: false, amount: 500, type: "CREDIT", idempotency_key: `stripe_session:mock`, workspace: workspaceId }]);
    const created = await billing.createBillingCheckoutSession({
      userId,
      workspaceId,
      amount: 500,
      requestUrl: "http://localhost:3000/workspaces/workspace-local-checkout/billing",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sessionId = created.session_id;
    const beforePayment = await billing.confirmStripeCheckoutSessionForRedirect({ sessionId, userId });
    expect(beforePayment.ok).toBe(false);
    expect(dbExecute).not.toHaveBeenCalled();

    await billing.completeLocalMockCheckout({ userId, sessionId });
    const first = await billing.confirmStripeCheckoutSessionForRedirect({ sessionId, userId });
    const second = await billing.confirmStripeCheckoutSessionForRedirect({ sessionId, userId });
    expect(first).toMatchObject({ ok: true, workspaceId, creditAmount: 500 });
    expect(second).toMatchObject({ ok: true, workspaceId, creditAmount: 500 });
    expect(dbExecute).toHaveBeenCalledTimes(2);
    const queryConfig = {
      escapeName: (name: string) => name,
      escapeParam: (index: number, value: unknown) => `$${index}:${String(value)}`,
      escapeString: (value: string) => value,
    };
    const [firstQuery, secondQuery] = dbExecute.mock.calls.map(([query]) =>
      (query as { toQuery: (config: typeof queryConfig) => { params: unknown[] } }).toQuery(queryConfig),
    );
    expect(firstQuery.params).toContain(`stripe_session:${sessionId}`);
    expect(secondQuery.params).toContain(`stripe_session:${sessionId}`);
    expect(firstQuery.params).toContain(workspaceId);
    expect(firstQuery.params).toContain(500);
    expect(secondQuery.params).toEqual(firstQuery.params);
  });

  test("rejects a foreign workspace actor and leaves the session unpaid", async () => {
    const billing = await import("../app/lib/platform-billing.server");
    const created = await billing.createBillingCheckoutSession({
      userId,
      workspaceId,
      amount: 500,
      requestUrl: "http://localhost:3000/billing",
    });
    if (!created.ok) throw new Error("Expected local checkout session");
    requireWorkspaceAccess.mockRejectedValueOnce(new Response("Not found", { status: 404 }));

    await expect(billing.completeLocalMockCheckout({ userId: "foreign-user", sessionId: created.session_id })).rejects.toMatchObject({ status: 404 });
    const confirmation = await billing.confirmStripeCheckoutSessionForRedirect({ sessionId: created.session_id, userId });
    expect(confirmation.ok).toBe(false);
    expect(dbExecute).not.toHaveBeenCalled();
    expect(requireWorkspaceAccess).toHaveBeenCalledWith({
      user: { id: "foreign-user" },
      workspaceId,
      minRole: MemberRole.Admin,
    });
  });
});
