import { beforeEach, describe, expect, test, vi } from "vitest";

describe("app/routes/api.auto-dial.end.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns 500 with message when conference listing throws", async () => {
    const mod = await import("../app/routes/api.auto-dial.end");

    const supabaseClient: any = {};
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/end", { method: "POST" }),
      deps: {
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () =>
          ({
            conferences: { list: async () => Promise.reject(new Error("list")) },
          }) as any,
      },
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "list" });
  }, 60000);

  test("handles conference/call update errors and still returns success", async () => {
    const mod = await import("../app/routes/api.auto-dial.end");

    const outreachSingle = vi
      .fn()
      // First call: outreach update fails -> should be logged and skip twilio hangup.
      .mockResolvedValueOnce({ data: { id: 1 }, error: new Error("db") })
      // Second call: outreach update succeeds -> then twilio hangup fails -> logged.
      .mockResolvedValueOnce({ data: { id: 2 }, error: null });

    const callSelect = vi.fn(async () => ({
      data: [
        { sid: "CA1", outreach_attempt_id: 1, contact_id: 1 },
        { sid: "CA2", outreach_attempt_id: 2, contact_id: 2 },
      ],
      error: null,
    }));

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return { select: () => ({ eq: async () => (await callSelect()) }) };
        }
        if (table === "outreach_attempt") {
          return {
            update: () => ({
              eq: () => ({
                single: outreachSingle,
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    const confUpdate = vi.fn(async () => ({}));
    const callUpdate = vi.fn().mockRejectedValueOnce(new Error("hangup"));

    const logger = { error: vi.fn(), debug: vi.fn() };

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/end", { method: "POST" }),
      deps: {
        logger: logger as any,
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () =>
          ({
            conferences: Object.assign(
              (sid: string) => ({ update: () => confUpdate(sid) }),
              { list: async () => [{ sid: "CONF1" }] },
            ),
            calls: (_sid: string) => ({ update: callUpdate }),
          }) as any,
      },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(logger.error).toHaveBeenCalled(); // outreach update error and call update error
    expect(callUpdate).toHaveBeenCalled();
  });

  test("returns success when there are no in-progress conferences", async () => {
    const mod = await import("../app/routes/api.auto-dial.end");
    const supabaseClient: any = {};
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/end", { method: "POST" }),
      deps: {
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () =>
          ({
            conferences: { list: async () => [] },
          }) as any,
      },
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("covers conf update error, call select error, empty call data, and missing outreach_attempt_id branches", async () => {
    const mod = await import("../app/routes/api.auto-dial.end");

    const logger = { error: vi.fn(), debug: vi.fn() };

    let callMode: "error" | "empty" | "missingAttempt" = "error";

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: async () => {
                if (callMode === "error") return { data: null, error: new Error("call") };
                if (callMode === "empty") return { data: [], error: null };
                return {
                  data: [{ sid: "CA1", outreach_attempt_id: null, contact_id: 1 }],
                  error: null,
                };
              },
            }),
          };
        }
        if (table === "outreach_attempt") {
          return {
            update: () => ({
              eq: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    const conferencesList = vi
      .fn()
      .mockResolvedValueOnce([{ sid: "CONF_BAD" }]) // conf update error
      .mockResolvedValueOnce([{ sid: "CONF_CALL" }]) // call select error
      .mockResolvedValueOnce([{ sid: "CONF_EMPTY" }]) // empty calls
      .mockResolvedValueOnce([{ sid: "CONF_NO_ATTEMPT" }]); // missing attempt id

    const confUpdate = vi.fn((sid: string) => {
      if (sid === "CONF_BAD") throw new Error("conf");
      return {};
    });

    const twilio: any = {
      conferences: Object.assign(
        (sid: string) => ({ update: async () => confUpdate(sid) }),
        { list: conferencesList },
      ),
      calls: () => ({ update: async () => ({}) }),
    };

    const makeReq = () =>
      new Request("http://localhost/api/auto-dial/end", { method: "POST" });

    // 1) conf update throws => logged in per-conf catch
    await expect(
      mod.action({
        request: makeReq(),
        deps: {
          logger: logger as any,
          verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
          safeParseJson: async () => ({ workspaceId: "w1" }),
          createWorkspaceTwilioInstance: async () => twilio,
        },
      } as any),
    ).resolves.toBeTruthy();

    // 2) call select error => thrown and logged in per-conf catch
    callMode = "error";
    await mod.action({
      request: makeReq(),
      deps: {
        logger: logger as any,
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () => twilio,
      },
    } as any);

    // 3) empty data => returns early (no error)
    callMode = "empty";
    await mod.action({
      request: makeReq(),
      deps: {
        logger: logger as any,
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () => twilio,
      },
    } as any);

    // 4) call without outreach_attempt_id => returns early inside calls.map
    callMode = "missingAttempt";
    await mod.action({
      request: makeReq(),
      deps: {
        logger: logger as any,
        verifyAuth: async () => ({ supabaseClient, user: { id: "u1" } } as any),
        safeParseJson: async () => ({ workspaceId: "w1" }),
        createWorkspaceTwilioInstance: async () => twilio,
      },
    } as any);

    expect(logger.error).toHaveBeenCalled();
  });

  test("covers resolveDeps fallbacks and non-Error outer catch message", async () => {
    vi.resetModules();

    vi.doMock("../app/lib/supabase.server", () => ({
      verifyAuth: async () => ({ supabaseClient: {}, user: { id: "u1" } }),
    }));
    vi.doMock("../app/lib/database.server", () => ({
      safeParseJson: async () => ({ workspaceId: "w1" }),
      createWorkspaceTwilioInstance: async () => ({
        conferences: { list: async () => Promise.reject("nope") },
      }),
    }));
    const logger = { error: vi.fn(), debug: vi.fn() };
    vi.doMock("@/lib/logger.server", () => ({ logger }));

    const mod = await import("../app/routes/api.auto-dial.end");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/end", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Unknown error occurred" });
  });
});

