import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import {
  withDataPlaneRouteArgs,
  withWorkspaceRouteArgs,
} from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  balance: vi.fn(async () => 250),
  ledger: vi.fn(async () => []),
  totals: vi.fn(async () => [{ usage: 0, purchased: 0 }]),
  activity: vi.fn(async () => ({
    ok: true,
    balance: 250,
    items: [],
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totals: { usage: 0, purchased: 0 },
  })),
  apiBilling: vi.fn(async () => ({
    ok: true,
    balance: 250,
    transactions: [],
    pricing: {},
  })),
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({
    workspace_member: { findFirst: mocks.membership },
    transaction_history: { findMany: mocks.ledger },
    execute: mocks.totals,
  })),
}));
vi.mock("@/lib/workspace-credits.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-credits.server")>()),
  getWorkspaceCreditsBalance: mocks.balance,
}));
vi.mock("@/lib/billing-activity.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing-activity.server")>()),
  getWorkspaceBillingActivity: mocks.activity,
}));
vi.mock("@/lib/platform-billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-billing.server")>()),
  getWorkspaceBilling: mocks.apiBilling,
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...original,
    env: { ...original.env, STRIPE_SECRET_KEY: () => "sk_test_placeholder" },
  };
});

const WS = "269bb842-344c-4738-9bc8-3dfa4569005e";

async function pageArgs(role: string) {
  return withWorkspaceRouteArgs(
    {
      request: new Request(`http://localhost/workspaces/${WS}/billing`),
      params: { id: WS },
    },
    {
      userRole: role,
      workspaceId: WS,
      userId: "user-1",
      headers: new Headers({ "x-auth-test": "retained" }),
    },
  );
}

async function apiArgs(userId: string | null = "user-1") {
  return withDataPlaneRouteArgs(
    {
      request: new Request(`http://localhost/api/workspaces/${WS}/billing`),
      params: { workspaceId: WS },
    },
    { userId, workspaceId: WS },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ role_id: "admin" });
});

describe("billing page read floor (#2137)", () => {
  test.each(["caller", "member", "unrecognized"])(
    "the actual loader throws 403 for %s before reading billing",
    async (role) => {
      const { loader } =
        await import("../app/routes/workspaces+/$id/billing.loader.server");
      await expect(loader(await pageArgs(role))).rejects.toMatchObject({
        status: 403,
      });
      const response = await asRouteResponse(loader(await pageArgs(role)));
      expect(response.headers.get("x-auth-test")).toBe("retained");
      expect(await response.text()).not.toContain("balance");
      expect(mocks.activity).not.toHaveBeenCalled();
    },
  );

  test.each(["admin", "owner"])(
    "the actual loader permits %s",
    async (role) => {
      const { loader } =
        await import("../app/routes/workspaces+/$id/billing.loader.server");
      const response = await asRouteResponse(loader(await pageArgs(role)));
      expect(response.status).toBe(200);
      expect(mocks.activity).toHaveBeenCalledOnce();
    },
  );
});

describe("billing service defence in depth (#2137)", () => {
  test.each(["caller", "member", "unrecognized"])(
    "the real membership check denies %s before balance or ledger reads",
    async (role) => {
      mocks.membership.mockResolvedValue({ role_id: role });
      const { getWorkspaceBillingActivity } = await vi.importActual<
        typeof import("@/lib/billing-activity.server")
      >("@/lib/billing-activity.server");
      await expect(
        getWorkspaceBillingActivity("user-1", WS),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.balance).not.toHaveBeenCalled();
      expect(mocks.ledger).not.toHaveBeenCalled();
      expect(mocks.totals).not.toHaveBeenCalled();
    },
  );

  test("a non-member still receives 404 without balance or ledger reads", async () => {
    mocks.membership.mockResolvedValue(null);
    const { getWorkspaceBillingActivity } = await vi.importActual<
      typeof import("@/lib/billing-activity.server")
    >("@/lib/billing-activity.server");
    await expect(
      getWorkspaceBillingActivity("user-1", WS),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.balance).not.toHaveBeenCalled();
    expect(mocks.ledger).not.toHaveBeenCalled();
  });

  test.each(["admin", "owner"])(
    "the real service permits %s and reads the ledger",
    async (role) => {
      mocks.membership.mockResolvedValue({ role_id: role });
      const { getWorkspaceBillingActivity } = await vi.importActual<
        typeof import("@/lib/billing-activity.server")
      >("@/lib/billing-activity.server");
      const result = await getWorkspaceBillingActivity("user-1", WS);
      expect(result.ok).toBe(true);
      expect(mocks.balance).toHaveBeenCalledOnce();
      expect(mocks.ledger).toHaveBeenCalledOnce();
    },
  );
});

describe("existing JSON billing read parity (#2137)", () => {
  test.each(["caller", "member"])(
    "the actual API auth denies %s before billing reads",
    async (role) => {
      mocks.membership.mockResolvedValue({ role_id: role });
      const { loader } =
        await import("../app/routes/api+/workspaces+/$workspaceId/billing.loader.server");
      const response = await asRouteResponse(loader(await apiArgs()));
      expect(response.status).toBe(403);
      expect(mocks.apiBilling).not.toHaveBeenCalled();
    },
  );

  test.each(["admin", "owner"])(
    "the actual API auth permits %s",
    async (role) => {
      mocks.membership.mockResolvedValue({ role_id: role });
      const { loader } =
        await import("../app/routes/api+/workspaces+/$workspaceId/billing.loader.server");
      const response = await asRouteResponse(loader(await apiArgs()));
      expect(response.status).toBe(200);
      expect(mocks.apiBilling).toHaveBeenCalledOnce();
    },
  );

  test("a non-member receives 404", async () => {
    mocks.membership.mockResolvedValue(null);
    const { loader } =
      await import("../app/routes/api+/workspaces+/$workspaceId/billing.loader.server");
    expect((await asRouteResponse(loader(await apiArgs()))).status).toBe(404);
    expect(mocks.apiBilling).not.toHaveBeenCalled();
  });

  test("an API-key context without a session user still receives 401", async () => {
    const { loader } =
      await import("../app/routes/api+/workspaces+/$workspaceId/billing.loader.server");
    expect((await asRouteResponse(loader(await apiArgs(null)))).status).toBe(
      401,
    );
    expect(mocks.apiBilling).not.toHaveBeenCalled();
  });
});
