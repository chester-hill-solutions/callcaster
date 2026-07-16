import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  createBillingCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/platform-billing.server", () => ({
  createBillingCheckoutSession: (...args: unknown[]) =>
    mocks.createBillingCheckoutSession(...args),
}));

function buildRequest() {
  const fd = new FormData();
  fd.set("amount", "5000");
  return new Request("http://localhost/workspaces/w1/billing", {
    method: "POST",
    body: fd,
  });
}

describe("workspaces_.$id.billing action role gate", () => {
  beforeEach(() => {
    mocks.createBillingCheckoutSession.mockReset();
  });

  test("a caller (below Admin) is rejected with 403 and checkout is never initiated", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/billing.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: buildRequest(), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(mocks.createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  test("a member (below Admin) is also rejected with 403 — billing requires Admin", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/billing.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: buildRequest(), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "member" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(mocks.createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  test("an admin reaches the checkout-session call", async () => {
    mocks.createBillingCheckoutSession.mockResolvedValue({
      ok: true,
      checkout_url: "https://checkout.example/session",
    });
    const mod = await import(
      "../app/routes/workspaces+/$id/billing.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          { request: buildRequest(), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "admin" },
        ),
      ),
    );

    expect(res.status).toBe(302);
    expect(mocks.createBillingCheckoutSession).toHaveBeenCalledTimes(1);
  });
});
