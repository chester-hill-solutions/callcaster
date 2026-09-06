import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, routeArgs } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  getPurchaseReceiptUrl: vi.fn(),
}));

vi.mock("@/lib/platform-billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-billing.server")>()),
  getPurchaseReceiptUrl: (...args: unknown[]) => mocks.getPurchaseReceiptUrl(...args),
}));
vi.mock("@/lib/capability-guard.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capability-guard.server")>()),
  dataPlaneSessionMinRoleAuth: () => async () => ({ userId: "u1", workspaceId: "ws1" }),
}));

const WS = "ws1";

describe("api+/workspaces+/$workspaceId/billing/receipt", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getPurchaseReceiptUrl.mockReset();
  });

  test("redirects to the receipt for a transaction in this workspace", async () => {
    mocks.getPurchaseReceiptUrl.mockResolvedValue({ ok: true, url: "https://invoice.stripe.com/i/abc" });
    const mod = await import("../app/routes/api+/workspaces+/$workspaceId/billing/receipt.loader.server");
    const res = await asRouteResponse(
      mod.loader(routeArgs(new Request(`http://x/api/workspaces/${WS}/billing/receipt?transaction=7`), { workspaceId: WS }) as never),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://invoice.stripe.com/i/abc");
    expect(mocks.getPurchaseReceiptUrl).toHaveBeenCalledWith({ userId: "u1", workspaceId: WS, transactionId: 7 });
  });

  test("requires a transaction id", async () => {
    const mod = await import("../app/routes/api+/workspaces+/$workspaceId/billing/receipt.loader.server");
    const res = await asRouteResponse(
      mod.loader(routeArgs(new Request(`http://x/api/workspaces/${WS}/billing/receipt`), { workspaceId: WS }) as never),
    );
    expect(res.status).toBe(400);
    expect(mocks.getPurchaseReceiptUrl).not.toHaveBeenCalled();
  });

  test("passes the helper's status through instead of a bare 500", async () => {
    mocks.getPurchaseReceiptUrl.mockResolvedValue({ ok: false, error: "Could not reach the payment provider.", status: 502 });
    const mod = await import("../app/routes/api+/workspaces+/$workspaceId/billing/receipt.loader.server");
    const res = await asRouteResponse(
      mod.loader(routeArgs(new Request(`http://x/api/workspaces/${WS}/billing/receipt?transaction=7`), { workspaceId: WS }) as never),
    );
    expect(res.status).toBe(502);
  });
});
