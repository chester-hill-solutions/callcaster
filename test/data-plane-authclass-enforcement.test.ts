/**
 * D1 (issue #1242) — declared `authClass` must equal enforced behavior on the
 * three drifted Data Plane endpoints.
 *
 * These tests pin the RESOLUTION, not just the current code: each endpoint
 * asserts the allowed role succeeds and the disallowed role gets the
 * conventional rejection (403 "Insufficient role" for an under-privileged
 * member, uniform 404 for a non-member per ADR-0004, 401 for an API key on a
 * `sessionOnly` surface).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  getWorkspaceCreditsBalance: vi.fn(),
  getWorkspaceBilling: vi.fn(),
  purchaseWorkspaceNumber: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: unknown[]) =>
    mocks.getWorkspaceCreditsBalance(...args),
}));

vi.mock("@/lib/platform-billing.server", () => ({
  getWorkspaceBilling: (...args: unknown[]) => mocks.getWorkspaceBilling(...args),
}));

vi.mock("@/lib/platform-workspace-numbers.server", () => ({
  purchaseWorkspaceNumber: (...args: unknown[]) =>
    mocks.purchaseWorkspaceNumber(...args),
}));

vi.mock("@/server/db", () => ({ db: {}, directPool: {} }));

import { loader as creditsLoader } from "../app/routes/api+/workspaces+/$workspaceId/credits.loader.server";
import { loader as billingLoader } from "../app/routes/api+/workspaces+/$workspaceId/billing.loader.server";
import { action as numbersAction } from "../app/routes/api+/workspaces+/$workspaceId/numbers.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-2222-2222-222222222222";

/** Route args carrying the data-plane middleware context for WORKSPACE. */
async function args(
  init?: RequestInit,
  dataPlaneOverrides: Record<string, unknown> = {},
) {
  return withDataPlaneRouteArgs(
    {
      request: new Request(
        `http://localhost/api/workspaces/${WORKSPACE}/x`,
        init,
      ),
      params: { workspaceId: WORKSPACE },
    },
    { workspaceId: WORKSPACE, ...dataPlaneOverrides },
  );
}

function withRole(role: string | null) {
  mocks.getUserRole.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspaceCreditsBalance.mockResolvedValue(1234);
  mocks.getWorkspaceBilling.mockResolvedValue({
    ok: true,
    balance: 1234,
    transactions: [],
    pricing: {},
  });
  mocks.purchaseWorkspaceNumber.mockResolvedValue({
    ok: true,
    status: 201,
    number: { phone_number: "+15555550100" },
    messagingServiceAttached: true,
  });
});

describe("GET /api/workspaces/:workspaceId/credits — declared `session`", () => {
  // Resolution: DOWNGRADE the declaration. The campaign call screen polls this
  // for every role, `caller` included, so a role floor would break dialing.
  test.each(["owner", "admin", "member", "caller"])(
    "role %s can read the balance",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(creditsLoader((await args()) as never));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ credits: 1234 });
    },
  );

  test("API-key request (no session user) is rejected 401 — sessionOnly", async () => {
    const res = await asRouteResponse(
      creditsLoader((await args(undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
  });

  test("cross-workspace context gets the uniform 404", async () => {
    const res = await asRouteResponse(
      creditsLoader(
        (await args(undefined, { workspaceId: OTHER_WORKSPACE })) as never,
      ),
    );
    expect(res.status).toBe(404);
    expect(mocks.getWorkspaceCreditsBalance).not.toHaveBeenCalled();
  });
});

describe("GET /api/workspaces/:workspaceId/billing — declared `workspaceAdmin`", () => {
  // Resolution: ENFORCE the declaration. No UI flow calls this endpoint.
  test.each(["owner", "admin"])("role %s can read billing", async (role) => {
    withRole(role);
    const res = await asRouteResponse(billingLoader((await args()) as never));
    expect(res.status).toBe(200);
    expect(mocks.getWorkspaceBilling).toHaveBeenCalledOnce();
  });

  test.each(["member", "caller"])(
    "role %s is rejected 403 and never reaches the billing read",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(billingLoader((await args()) as never));
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: "Insufficient role" });
      expect(mocks.getWorkspaceBilling).not.toHaveBeenCalled();
    },
  );

  test("non-member gets the uniform 404, not 403 (ADR-0004)", async () => {
    withRole(null);
    const res = await asRouteResponse(billingLoader((await args()) as never));
    expect(res.status).toBe(404);
    expect(mocks.getWorkspaceBilling).not.toHaveBeenCalled();
  });

  test("API-key request (no session user) is rejected 401 — sessionOnly", async () => {
    const res = await asRouteResponse(
      billingLoader((await args(undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
    expect(mocks.getUserRole).not.toHaveBeenCalled();
  });
});

describe("POST /api/workspaces/:workspaceId/numbers — declared `session`", () => {
  // Resolution: DOWNGRADE the declaration to the enforced numbers-manager rule
  // (member and above), and hoist that rule to the route's auth strategy.
  const purchase = () =>
    args({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: "+15555550100" }),
    });

  test.each(["owner", "admin", "member"])(
    "role %s can purchase a number",
    async (role) => {
      withRole(role);
      const res = await asRouteResponse(
        numbersAction((await purchase()) as never),
      );
      expect(res.status).toBe(201);
      expect(mocks.purchaseWorkspaceNumber).toHaveBeenCalledOnce();
    },
  );

  test("caller is rejected 403 before any credit is debited", async () => {
    withRole("caller");
    const res = await asRouteResponse(
      numbersAction((await purchase()) as never),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Insufficient role" });
    expect(mocks.purchaseWorkspaceNumber).not.toHaveBeenCalled();
  });

  test("non-member gets the uniform 404, not 403 (ADR-0004)", async () => {
    withRole(null);
    const res = await asRouteResponse(
      numbersAction((await purchase()) as never),
    );
    expect(res.status).toBe(404);
    expect(mocks.purchaseWorkspaceNumber).not.toHaveBeenCalled();
  });

  test("API-key request (no session user) is rejected 401 — sessionOnly", async () => {
    const res = await asRouteResponse(
      numbersAction(
        (await withDataPlaneRouteArgs(
          {
            request: new Request(
              `http://localhost/api/workspaces/${WORKSPACE}/numbers`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone_number: "+15555550100" }),
              },
            ),
            params: { workspaceId: WORKSPACE },
          },
          { workspaceId: WORKSPACE, userId: null },
        )) as never,
      ),
    );
    expect(res.status).toBe(401);
    expect(mocks.purchaseWorkspaceNumber).not.toHaveBeenCalled();
  });
});

describe("declaration matches enforcement in the API surface inventory", () => {
  test("the three resolved entries carry their post-D1 authClass", async () => {
    const { API_SURFACE } = await import("@/lib/api-surface");
    const byPath = (path: string) => {
      const entry = API_SURFACE.find((e) => e.path === path);
      if (!entry) throw new Error(`missing surface entry: ${path}`);
      return entry;
    };

    expect(byPath("/api/workspaces/:workspaceId/credits").authClass).toBe(
      "session",
    );
    expect(byPath("/api/workspaces/:workspaceId/billing").authClass).toBe(
      "workspaceAdmin",
    );
    expect(byPath("/api/workspaces/:workspaceId/numbers").authClass).toBe(
      "session",
    );
    // Flat alias for the same purchase operation — kept in step.
    expect(byPath("/api/numbers").authClass).toBe("session");
  });
});
