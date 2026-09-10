import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse, routeArgs } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  workspaceLoaderAuth: vi.fn(),
  getWorkspaceBillingActivity: vi.fn(),
  env: {
    STRIPE_SECRET_KEY: vi.fn(() => "sk_test_placeholder"),
  },
}));

vi.mock("@/lib/workspace-route.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-route.server")>()),
  workspaceLoaderAuth: (...args: unknown[]) => mocks.workspaceLoaderAuth(...args),
}));

vi.mock("@/lib/billing-activity.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing-activity.server")>()),
  getWorkspaceBillingActivity: (...args: unknown[]) =>
    mocks.getWorkspaceBillingActivity(...args),
}));

vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: mocks.env,
  getStripeKeyMode: () => "live",
}));

const WS = "269bb842-344c-4738-9bc8-3dfa4569005e";

function memberAuth(workspaceId = WS) {
  return {
    ok: true,
    ctx: {
      headers: new Headers({ "set-cookie": "session=abc" }),
      user: { id: "u1" },
      userRole: "owner",
      workspaceId,
    },
  };
}

describe("workspaces+/$id/billing loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.workspaceLoaderAuth.mockReset();
    mocks.getWorkspaceBillingActivity.mockReset();
    mocks.getWorkspaceBillingActivity.mockResolvedValue({
      ok: true,
      balance: 802,
      history: [{ id: "1", type: "DEBIT", amount: -2 }],
      campaignNames: { 12: "Reminder" },
      page: 1,
      pageSize: 500,
      totalCount: 1_861,
      totals: { usage: 3_798, purchased: 4_600 },
    });
  });

  test("passes the requested page and filter through to the service", async () => {
    mocks.workspaceLoaderAuth.mockResolvedValue(memberAuth());
    const mod = await import("../app/routes/workspaces+/$id/billing.loader.server");

    const res = await asRouteResponse(
      mod.loader(
        routeArgs(
          new Request(`http://x/workspaces/${WS}/billing?page=3&filter=usage`),
          { id: WS },
        ) as never,
      ) as Promise<unknown>,
    );

    expect(mocks.getWorkspaceBillingActivity).toHaveBeenCalledWith(
      "u1",
      WS,
      { page: 3, filter: "usage" },
    );
    expect(res).toMatchObject({
      credits: {
        balance: 802,
        page: 1,
        pageSize: 500,
        totalCount: 1_861,
        totals: { usage: 3_798, purchased: 4_600 },
        filter: "usage",
      },
      campaignNames: { 12: "Reminder" },
    });
  });

  test("defaults page to 1 and rejects an unknown filter", async () => {
    mocks.workspaceLoaderAuth.mockResolvedValue(memberAuth());
    const mod = await import("../app/routes/workspaces+/$id/billing.loader.server");

    await asRouteResponse(
      mod.loader(
        routeArgs(new Request(`http://x/workspaces/${WS}/billing`), { id: WS }) as never,
      ) as Promise<unknown>,
    );

    expect(mocks.getWorkspaceBillingActivity).toHaveBeenCalledWith(
      "u1",
      WS,
      { page: 1, filter: "all" },
    );
  });

  test("returns the auth failure when the user lacks workspace access", async () => {
    const denied = new Response("Forbidden", { status: 403 });
    mocks.workspaceLoaderAuth.mockResolvedValue({
      ok: false,
      response: denied,
    });
    const mod = await import("../app/routes/workspaces+/$id/billing.loader.server");

    const res = await asRouteResponse(
      mod.loader(
        routeArgs(new Request(`http://x/workspaces/${WS}/billing`), { id: WS }) as never,
      ) as Promise<unknown>,
    );

    if (res instanceof Response) {
      throw new Error("asRouteResponse normalizes Responses; check res.status instead");
    }
    expect(res.status).toBe(403);
    expect(mocks.getWorkspaceBillingActivity).not.toHaveBeenCalled();
  });
});