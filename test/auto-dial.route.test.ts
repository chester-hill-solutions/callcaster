import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const autoDialMocks = vi.hoisted(() => ({
  creditsBalance: 5 as number | null,
  creditsError: null as Error | null,
  insertCalls: [] as unknown[],
  insertCallResults: [] as Array<Record<string, unknown> | null>,
  updateCallCalls: [] as unknown[],
  deleteCallCalls: [] as unknown[],
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => {
    if (autoDialMocks.creditsError) {
      throw autoDialMocks.creditsError;
    }
    return autoDialMocks.creditsBalance;
  }),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: vi.fn(async (_workspaceId: string, payload: unknown) => {
    autoDialMocks.insertCalls.push(payload);
    if (autoDialMocks.insertCallResults.length > 0) {
      return autoDialMocks.insertCallResults.shift() ?? null;
    }
    return payload as Record<string, unknown>;
  }),
  updateCallBySid: vi.fn(async (...args: unknown[]) => {
    autoDialMocks.updateCallCalls.push(args);
    return {};
  }),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      delete: vi.fn(async (opts: unknown) => {
        autoDialMocks.deleteCallCalls.push(opts);
      }),
    },
  })),
}));

const authDeps = {
  getAuthenticatedUser: async () => ({ id: "u1" }),
  requireWorkspaceAccess: async () => undefined,
};

function resetAutoDialMocks() {
  autoDialMocks.creditsBalance = 5;
  autoDialMocks.creditsError = null;
  autoDialMocks.insertCalls = [];
  autoDialMocks.insertCallResults = [{ sid: "pending" }, { sid: "CA1" }];
  autoDialMocks.updateCallCalls = [];
  autoDialMocks.deleteCallCalls = [];
}

describe("app/routes/api+/auto-dial/tsx.route", () => {
  beforeEach(() => {
    resetAutoDialMocks();
    vi.resetModules();
  });

  test("returns creditsError when workspace has no credits", async () => {
    autoDialMocks.creditsBalance = 0;
    const mod = await import("../app/routes/api+/auto-dial");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: 1,
          workspace_id: "w1",
          selected_device: "computer",
        }),
      },
    } as any));

    expect(res).toMatchObject({ creditsError: true });
  });

  test("returns 400 JSON when required parameters are missing", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({ user_id: "u1", caller_id: "+1555" }),
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    const response = res as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Missing required auto-dial parameters",
    });
  });

  test("throws when workspace credits query errors", async () => {
    autoDialMocks.creditsError = new Error("db");
    const mod = await import("../app/routes/api+/auto-dial");

    await expect(
      mod.action({
        request: new Request("http://localhost/api/auto-dial", {
          method: "POST",
        }),
        deps: {
          ...authDeps,
          getSession: () =>
            ({ headers: new Headers() }) as any,
          safeParseJson: async () => ({
            user_id: "u1",
            caller_id: "+1555",
            campaign_id: 1,
            workspace_id: "w1",
            selected_device: "computer",
          }),
        },
      } as any),
    ).rejects.toThrow("db");
  });

  test("creates call, upserts call row, and returns JSON Response", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const sequence: string[] = [];
    const callsCreate = vi.fn(async () => {
      sequence.push("twilio-create");
      return {
        sid: "CA1",
        accountSid: "AC",
        from: "+1555",
        status: "queued",
        apiVersion: "v",
        uri: "/",
        dateUpdated: new Date(0),
      };
    });

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: 1,
          workspace_id: "w1",
          selected_device: "computer",
        }),
        createWorkspaceTwilioInstance: async () =>
          ({
            calls: { create: callsCreate },
          }) as any,
        env: { BASE_URL: () => "https://base.example" } as any,
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    const response = res as Response;
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({
      success: true,
      conferenceName: "u1",
    });
    expect(callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client:u1",
        from: "+1555",
        url: "https://base.example/api/auto-dial/u1",
      }),
    );
    expect(autoDialMocks.insertCalls).toHaveLength(2);
    expect(autoDialMocks.insertCalls[1]).toMatchObject({
      sid: "CA1",
      campaign_id: 1,
    });
    expect(autoDialMocks.deleteCallCalls).toHaveLength(1);
    expect(sequence).toEqual(["twilio-create"]);
  });

  test("uses client target when selected_device is not a string", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const callsCreate = vi.fn(async () => ({ sid: "CA2" }));

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: 1,
          workspace_id: "w1",
          selected_device: 123,
        }),
        createWorkspaceTwilioInstance: async () =>
          ({ calls: { create: callsCreate } }) as any,
        env: { BASE_URL: () => "https://base.example" } as any,
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    expect(callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client:u1",
      }),
    );
  });

  test("stores null campaign_id when payload campaign_id is not a number", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: "1",
          workspace_id: "w1",
          selected_device: "computer",
        }),
        createWorkspaceTwilioInstance: async () =>
          ({ calls: { create: async () => ({ sid: "CA3" }) } }) as any,
        env: { BASE_URL: () => "https://base.example" } as any,
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    expect(autoDialMocks.insertCalls[0]).toMatchObject({ campaign_id: null });
    expect(autoDialMocks.insertCalls[1]).toMatchObject({ campaign_id: null });
  });

  test("returns success:false Response when twilio call create throws", async () => {
    const mod = await import("../app/routes/api+/auto-dial");
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        ...authDeps,
        logger: logger as any,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: 1,
          workspace_id: "w1",
          selected_device: "+15550001111",
        }),
        createWorkspaceTwilioInstance: async () =>
          ({
            calls: { create: async () => Promise.reject(new Error("twilio")) },
          }) as any,
        env: { BASE_URL: () => "https://base.example" } as any,
      },
    } as any));

    expect(logger.error).toHaveBeenCalled();
    expect(autoDialMocks.updateCallCalls).toHaveLength(1);
    const response = res as Response;
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "twilio",
    });
  });

  test("covers resolveDeps fallbacks and logs call upsert error", async () => {
    resetAutoDialMocks();
    autoDialMocks.insertCallResults = [{ sid: "pending" }, null];
    vi.resetModules();

    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const callsCreate = vi.fn(async () => ({ sid: "CA1" }));
    const callsUpdate = vi.fn(async () => ({}));

    vi.doMock("../app/lib/adminDb.server", () => ({
      getSession: () => ({
        null: {
          auth: {
            getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
          },
        },
        headers: new Headers(),
      }),
    }));
    vi.doMock("../app/lib/database.server", () => ({
      requireWorkspaceAccess: async () => undefined,
      safeParseJson: async () => ({
        user_id: "u1",
        caller_id: "+1555",
        campaign_id: 1,
        workspace_id: "w1",
        selected_device: "computer",
      }),
      createWorkspaceTwilioInstance: async () => ({
        calls: Object.assign(
          (sid: string) => ({
            update: callsUpdate,
          }),
          { create: callsCreate },
        ),
      }),
    }));
    vi.doMock("@/lib/env.server", () => ({
      env: { BASE_URL: () => "https://base.example" },
    }));
    vi.doMock("@/lib/logger.server", () => ({ logger }));

    const mod = await import("../app/routes/api+/auto-dial");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    expect(logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.objectContaining({ callSid: "CA1" }),
    );
  });

  test("returns 401 when no authenticated user is found", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        getAuthenticatedUser: async () => null,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          workspace_id: "w1",
        }),
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    expect((res as Response).status).toBe(401);
  });

  test("returns 403 when workspace access is denied", async () => {
    const mod = await import("../app/routes/api+/auto-dial");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        getAuthenticatedUser: async () => ({ id: "u1" }),
        requireWorkspaceAccess: async () => {
          throw new Error("forbidden");
        },
        logger: { warn: vi.fn(), error: vi.fn() , info: vi.fn(), debug: vi.fn()} as any,
        getSession: () =>
          ({ headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          workspace_id: "w1",
        }),
      },
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    expect((res as Response).status).toBe(403);
  });
});
