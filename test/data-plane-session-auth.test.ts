/**
 * #1265 (mechanical slice of the #1242 D3 follow-up) — the 19 session-only
 * data-plane preambles that PR #1261 deferred moved onto a new shared
 * strategy, `dataPlaneSessionAuth`: membership-only, no capability, no role
 * floor above the lowest rank. It is the plain sibling of
 * `dataPlaneSessionMinRoleAuth` (which D1 added for routes with a real role
 * floor).
 *
 * These tests pin the strategy's own rejection shapes, then spot-check three
 * of the migrated routes end to end to confirm the swap from the hand-rolled
 * `getDataPlaneRouteContext` + `!userId` preamble to `dataPlaneSessionAuth()`
 * changed nothing observable.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  getWorkspaceAnalyticsApi: vi.fn(),
  startCallListeningApi: vi.fn(),
  stopCallListeningApi: vi.fn(),
  getHandsetSessionApi: vi.fn(),
  deleteHandsetSessionApi: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: vi.fn(async () => ({ role: "member" })),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/platform-analytics.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-analytics.server")>();
  return {
    ...actual,
    getWorkspaceAnalyticsApi: (...args: unknown[]) =>
      mocks.getWorkspaceAnalyticsApi(...args),
  };
});

vi.mock("@/lib/platform-telephony.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-telephony.server")>();
  return {
    ...actual,
    startCallListeningApi: (...args: unknown[]) => mocks.startCallListeningApi(...args),
    stopCallListeningApi: (...args: unknown[]) => mocks.stopCallListeningApi(...args),
    getHandsetSessionApi: (...args: unknown[]) => mocks.getHandsetSessionApi(...args),
    deleteHandsetSessionApi: (...args: unknown[]) => mocks.deleteHandsetSessionApi(...args),
  };
});

vi.mock("@/server/db", () => ({ db: {}, directPool: {} }));

import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { loader as analyticsLoader } from "../app/routes/api+/workspaces+/$workspaceId/analytics.loader.server";
import { action as callsListeningAction } from "../app/routes/api+/workspaces+/$workspaceId/calls/listening.action.server";
import {
  loader as handsetSessionLoader,
  action as handsetSessionAction,
} from "../app/routes/api+/workspaces+/$workspaceId/handset/session.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-2222-2222-222222222222";

async function args(
  init?: RequestInit,
  dataPlaneOverrides: Record<string, unknown> = {},
) {
  return withDataPlaneRouteArgs(
    {
      request: new Request(`http://localhost/api/workspaces/${WORKSPACE}/x`, init),
      params: { workspaceId: WORKSPACE },
    },
    { workspaceId: WORKSPACE, ...dataPlaneOverrides },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspaceAnalyticsApi.mockResolvedValue({ analytics: { total: 0 } });
  mocks.startCallListeningApi.mockResolvedValue({
    ok: true,
    listening: true,
    token: "tok",
    token_error: null,
    handset_number: "+15555550100",
    client_identity: "client-1",
  });
  mocks.stopCallListeningApi.mockResolvedValue({ listening: false });
  mocks.getHandsetSessionApi.mockResolvedValue({
    handset_number: "+15555550100",
    listening: false,
  });
  mocks.deleteHandsetSessionApi.mockResolvedValue({ success: true });
});

describe("dataPlaneSessionAuth() strategy", () => {
  test("workspaceId missing from params → 400", async () => {
    const strategy = dataPlaneSessionAuth();
    const context = await import("./helpers/route-context-mock").then((m) =>
      m.createRouteContextProvider({}),
    );
    const result = await strategy({ params: {}, context });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  test("member (any role) resolves to { workspaceId, userId }", async () => {
    const strategy = dataPlaneSessionAuth();
    const routeArgs = await args();
    const result = await strategy(routeArgs);
    expect(result).toEqual({ workspaceId: WORKSPACE, userId: "user-1" });
  });

  test("no session user (API key or unauthenticated) → 401", async () => {
    const strategy = dataPlaneSessionAuth();
    const routeArgs = await args(undefined, { userId: null });
    const result = await strategy(routeArgs);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  test("workspace in context doesn't match the route param → uniform 404 (ADR-0004)", async () => {
    const strategy = dataPlaneSessionAuth();
    const routeArgs = await args(undefined, { workspaceId: OTHER_WORKSPACE });
    let caught: unknown;
    try {
      await strategy(routeArgs);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
  });
});

describe("GET /api/workspaces/:workspaceId/analytics — migrated to dataPlaneSessionAuth", () => {
  test("any member reads analytics", async () => {
    const res = await asRouteResponse(analyticsLoader((await args()) as never));
    expect(res.status).toBe(200);
    expect(mocks.getWorkspaceAnalyticsApi).toHaveBeenCalledWith(
      "user-1",
      WORKSPACE,
      expect.any(String),
    );
  });

  test("API-key request (no session user) is rejected 401", async () => {
    const res = await asRouteResponse(
      analyticsLoader((await args(undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
    expect(mocks.getWorkspaceAnalyticsApi).not.toHaveBeenCalled();
  });

  test("cross-workspace context gets the uniform 404", async () => {
    const res = await asRouteResponse(
      analyticsLoader(
        (await args(undefined, { workspaceId: OTHER_WORKSPACE })) as never,
      ),
    );
    expect(res.status).toBe(404);
    expect(mocks.getWorkspaceAnalyticsApi).not.toHaveBeenCalled();
  });
});

describe("POST|DELETE /api/workspaces/:workspaceId/calls/listening — migrated to dataPlaneSessionAuth", () => {
  test("member can start listening", async () => {
    const res = await asRouteResponse(
      callsListeningAction((await args({ method: "POST" })) as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.startCallListeningApi).toHaveBeenCalledOnce();
  });

  test("member can stop listening", async () => {
    const res = await asRouteResponse(
      callsListeningAction((await args({ method: "DELETE" })) as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.stopCallListeningApi).toHaveBeenCalledOnce();
  });

  test("API-key request (no session user) is rejected 401 before any business logic", async () => {
    const res = await asRouteResponse(
      callsListeningAction(
        (await args({ method: "POST" }, { userId: null })) as never,
      ),
    );
    expect(res.status).toBe(401);
    expect(mocks.startCallListeningApi).not.toHaveBeenCalled();
  });
});

describe("GET/DELETE /api/workspaces/:workspaceId/handset/session — migrated to dataPlaneSessionAuth", () => {
  test("member can read the handset session", async () => {
    const res = await asRouteResponse(
      handsetSessionLoader((await args()) as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.getHandsetSessionApi).toHaveBeenCalledOnce();
  });

  test("member can end the handset session", async () => {
    const res = await asRouteResponse(
      handsetSessionAction((await args({ method: "DELETE" })) as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteHandsetSessionApi).toHaveBeenCalledOnce();
  });

  test("API-key request (no session user) is rejected 401", async () => {
    const res = await asRouteResponse(
      handsetSessionLoader((await args(undefined, { userId: null })) as never),
    );
    expect(res.status).toBe(401);
    expect(mocks.getHandsetSessionApi).not.toHaveBeenCalled();
  });
});
