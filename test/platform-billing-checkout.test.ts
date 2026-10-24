import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", async (importOriginal) => {
  const handler = { get: (_target: unknown, prop: string) => () => `test-${prop}` };
  return {
    ...(await importOriginal<typeof import("@/lib/env.server")>()),
    env: new Proxy({}, handler),
  };
});

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const sessionsCreate = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
    customers = { create: vi.fn() };
  },
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    // Workspace rows carry an existing Stripe customer id, so the
    // ensureStripeCustomer look-up resolves without a cards call.
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ stripe_id: "cus_test_1" }]) }),
      }),
    }),
  },
}));
vi.mock("@/server/tenant-db", () => ({ createTenantDb: vi.fn() }));
vi.mock("@/lib/database/stripe.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/stripe.server")>()),
  createStripeContact: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: vi.fn(),
}));
vi.mock("@/lib/transaction-history.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transaction-history.server")>()),
  insertTransactionHistoryIdempotent: vi.fn(),
}));

const WORKSPACE_ID = "c519a538-de2b-4957-84fb-f1fd9171e01d";

async function checkout(amount: number) {
  const mod = await import("../app/lib/platform-billing.server");
  return mod.createBillingCheckoutSession({
    userId: "user_1",
    workspaceId: WORKSPACE_ID,
    amount,
    requestUrl: `https://app.callcaster.ca/workspaces/${WORKSPACE_ID}/billing`,
  });
}

// #1981: the Stripe-hosted receipt must state how many credits were bought
// instead of "Workspace credits × 1".
describe("createBillingCheckoutSession line item", () => {
  beforeEach(() => {
    sessionsCreate.mockReset();
    sessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      id: "cs_test_1",
    });
  });

  test.each([
    { amount: 500, totalInCents: 1000 },
    { amount: 2500, totalInCents: 5000 },
    { amount: 25000, totalInCents: 50000 },
  ])(
    "uses credits as the Stripe quantity ($amount credits)",
    async ({ amount, totalInCents }) => {
      const result = await checkout(amount);

      expect(result).toMatchObject({ ok: true });
      const lineItem = sessionsCreate.mock.calls[0][0].line_items[0];
      expect(lineItem.price_data.product_data.name).toBe("Workspace credits");
      expect(lineItem.quantity).toBe(amount);
      expect(lineItem.price_data.unit_amount).toBe(2);
      expect(lineItem.quantity * lineItem.price_data.unit_amount).toBe(totalInCents);
      expect(sessionsCreate.mock.calls[0][0].metadata).toEqual({
        workspaceId: WORKSPACE_ID,
        creditAmount: String(amount),
      });
    },
  );

  test("rejects fractional credit quantities before creating Checkout", async () => {
    const result = await checkout(500.5);

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
