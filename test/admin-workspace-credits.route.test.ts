import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, normalizeRouteResult } from "./helpers/route-result";
import { createRouteContextProvider, withAdminRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
  getWorkspaceCreditsBalance: vi.fn(),
  getWorkspaceById: vi.fn(),
  findRecentTransactions: vi.fn(async () => []),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    transaction_history: {
      findMany: mocks.findRecentTransactions,
    },
  }),
}));

vi.mock("@/lib/transaction-history.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transaction-history.server")>()),
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));

vi.mock("@/lib/workspace-credits.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-credits.server")>()),
  getWorkspaceCreditsBalance: (...args: unknown[]) =>
    mocks.getWorkspaceCreditsBalance(...args),
}));

vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-members-db.server")>()),
  getWorkspaceById: (...args: unknown[]) => mocks.getWorkspaceById(...args),
}));

function manualCreditForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("_action", "manual_credit_load");
  formData.set("amount", "500");
  formData.set("reason", "goodwill grant");
  formData.set("nonce", "nonce-abc");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

async function postManualCredit(formData: FormData) {
  const mod = await import("../app/routes/admin+/workspaces/$workspaceId/credits.route");
  return asRouteResponse(
    mod.action(
      await withAdminRouteArgs({
        request: new Request("http://x/credits", { method: "POST", body: formData }),
        params: { workspaceId: "ws-1" },
      }),
    ),
  );
}

describe("admin workspace credits route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: true,
      existingId: 1,
    });
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(2500);
    mocks.getWorkspaceById.mockResolvedValue({ id: "ws-1", name: "Acme" });
    mocks.findRecentTransactions.mockResolvedValue([]);
  });

  test("action rejects a non-numeric amount", async () => {
    const res = await postManualCredit(manualCreditForm({ amount: "abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "Amount must be a whole number between 1 and 100,000.",
    });
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("action rejects amount out of range (0 and 100001)", async () => {
    for (const amount of ["0", "-5", "100001"]) {
      const res = await postManualCredit(manualCreditForm({ amount }));
      expect(res.status).toBe(400);
      expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
    }
  });

  test("action rejects a missing reason", async () => {
    const res = await postManualCredit(manualCreditForm({ reason: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "A reason is required." });
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("action rejects a missing nonce", async () => {
    const res = await postManualCredit(manualCreditForm({ nonce: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "Form nonce is missing; reload the page and try again.",
    });
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("action inserts a CREDIT grant with manual-credit key and audit note", async () => {
    const res = await postManualCredit(manualCreditForm());

    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.anything(),
      {
        workspaceId: "ws-1",
        type: "CREDIT",
        amount: 500,
        note: "Manual credit load by ops@example.com: goodwill grant",
        idempotencyKey: "manual-credit:ws-1:nonce-abc",
      },
    );
    const body = await res.json();
    expect(body.success).toContain("500 credits loaded");
  });

  test("action treats a replayed submission as a no-op (idempotent)", async () => {
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: false,
      existingId: 7,
    });

    const res = await postManualCredit(manualCreditForm());

    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.success).toContain("already submitted");
  });

  test("loader returns balance, recent transactions, and a form nonce", async () => {
    const recentTransactions = [
      {
        id: 2,
        created_at: "2026-09-24T12:00:00.000Z",
        type: "CREDIT",
        amount: 500,
        note: "Manual credit load by ops@example.com: goodwill grant",
        idempotency_key: "manual-credit:ws-1:nonce-abc",
      },
      {
        id: 1,
        created_at: "2026-09-23T12:00:00.000Z",
        type: "DEBIT",
        amount: -7,
        note: "some call",
        idempotency_key: null,
      },
    ];
    mocks.findRecentTransactions.mockResolvedValue(recentTransactions);

    const mod = await import("../app/routes/admin+/workspaces/$workspaceId/credits.route");
    const { status, body } = await normalizeRouteResult(
      await mod.loader(
        await withAdminRouteArgs({ params: { workspaceId: "ws-1" } }),
      ),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      workspace: { id: "ws-1", name: "Acme" },
      balance: 2500,
      recentTransactions,
    });
    if (
      typeof body === "object" &&
      body !== null &&
      "nonce" in body &&
      typeof (body as { nonce: unknown }).nonce === "string"
    ) {
      expect((body as { nonce: string }).nonce.length).toBeGreaterThan(0);
    } else {
      throw new Error("loader did not return a nonce string");
    }
  });

  test("loader 404s when the workspace does not exist", async () => {
    mocks.getWorkspaceById.mockResolvedValue(null);
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(null);

    const mod = await import("../app/routes/admin+/workspaces/$workspaceId/credits.route");
    const { status, body } = await normalizeRouteResult(
      await mod.loader(
        await withAdminRouteArgs({ params: { workspaceId: "ws-404" } }),
      ),
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ error: "Workspace not found" });
  });

  test("admin context missing returns 500", async () => {
    const mod = await import("../app/routes/admin+/workspaces/$workspaceId/credits.route");
    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://x/credits", {
          method: "POST",
          body: manualCreditForm(),
        }),
        params: { workspaceId: "ws-1" },
        context: await createRouteContextProvider({}),
      } as never),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Admin context missing" });
  });
});