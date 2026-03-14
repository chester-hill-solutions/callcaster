import { beforeEach, describe, expect, test, vi } from "vitest";

describe("app/routes/api.auto-dial.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns creditsError when workspace has no credits", async () => {
    const mod = await import("../app/routes/api.auto-dial");

    const supabase: any = {
      from: (table: string) => {
        expect(table).toBe("workspace");
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { credits: 0 }, error: null }),
            }),
          }),
        };
      },
    };

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        createSupabaseServerClient: () =>
          ({ supabaseClient: supabase, headers: new Headers() }) as any,
        safeParseJson: async () => ({
          user_id: "u1",
          caller_id: "+1555",
          campaign_id: 1,
          workspace_id: "w1",
          selected_device: "computer",
        }),
      },
    } as any);

    expect(res).toEqual({ creditsError: true });
  });

  test("returns 400 JSON when required parameters are missing", async () => {
    const mod = await import("../app/routes/api.auto-dial");

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        createSupabaseServerClient: () =>
          ({ supabaseClient: {}, headers: new Headers() }) as any,
        safeParseJson: async () => ({ user_id: "u1", caller_id: "+1555" }),
      },
    } as any);

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Missing required auto-dial parameters",
    });
  });

  test("throws when workspace credits query errors", async () => {
    const mod = await import("../app/routes/api.auto-dial");

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("db") }),
          }),
        }),
      }),
    };

    await expect(
      mod.action({
        request: new Request("http://localhost/api/auto-dial", {
          method: "POST",
        }),
        deps: {
          createSupabaseServerClient: () =>
            ({ supabaseClient: supabase, headers: new Headers() }) as any,
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
    const mod = await import("../app/routes/api.auto-dial");

    const upsertSelect = vi.fn(async () => ({ error: null }));
    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 5 }, error: null }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            upsert: (data: any) => {
              expect(data).toMatchObject({
                sid: "CA1",
                workspace: "w1",
                campaign_id: 1,
              });
              return { select: upsertSelect };
            },
          };
        }
        throw new Error("unexpected table");
      },
    };

    const callsCreate = vi.fn(async () => ({
      sid: "CA1",
      accountSid: "AC",
      from: "+1555",
      status: "queued",
      apiVersion: "v",
      uri: "/",
      dateUpdated: new Date(0),
    }));

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        createSupabaseServerClient: () =>
          ({ supabaseClient: supabase, headers: new Headers() }) as any,
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
    } as any);

    expect(res).toBeInstanceOf(Response);
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
    expect(upsertSelect).toHaveBeenCalled();
  });

  test("uses client target when selected_device is not a string", async () => {
    const mod = await import("../app/routes/api.auto-dial");

    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 5 }, error: null }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            upsert: () => ({
              select: async () => ({ error: null }),
            }),
          };
        }
        throw new Error("unexpected table");
      },
    };

    const callsCreate = vi.fn(async () => ({ sid: "CA2" }));

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        createSupabaseServerClient: () =>
          ({ supabaseClient: supabase, headers: new Headers() }) as any,
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
    } as any);

    expect(res).toBeInstanceOf(Response);
    expect(callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client:u1",
      }),
    );
  });

  test("stores null campaign_id when payload campaign_id is not a number", async () => {
    const mod = await import("../app/routes/api.auto-dial");

    const upsertSelect = vi.fn(async () => ({ error: null }));
    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 5 }, error: null }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            upsert: (data: any) => {
              expect(data.campaign_id).toBeNull();
              return { select: upsertSelect };
            },
          };
        }
        throw new Error("unexpected table");
      },
    };

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        createSupabaseServerClient: () =>
          ({ supabaseClient: supabase, headers: new Headers() }) as any,
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
    } as any);

    expect(res).toBeInstanceOf(Response);
    expect(upsertSelect).toHaveBeenCalled();
  });

  test("returns success:false Response when twilio call create throws", async () => {
    const mod = await import("../app/routes/api.auto-dial");
    const logger = { error: vi.fn() };

    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 5 }, error: null }),
              }),
            }),
          };
        }
        if (table === "call") {
          return { upsert: () => ({ select: async () => ({ error: null }) }) };
        }
        throw new Error("unexpected");
      },
    };

    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
      deps: {
        logger: logger as any,
        createSupabaseServerClient: () =>
          ({ supabaseClient: supabase, headers: new Headers() }) as any,
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
    } as any);

    expect(logger.error).toHaveBeenCalled();
    const response = res as Response;
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "twilio",
    });
  });

  test("covers resolveDeps fallbacks and logs call upsert error", async () => {
    vi.resetModules();

    const logger = { error: vi.fn() };
    const callsCreate = vi.fn(async () => ({ sid: "CA1" }));

    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 1 }, error: null }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            upsert: () => ({
              select: async () => ({ error: new Error("upsert") }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    vi.doMock("../app/lib/supabase.server", () => ({
      createSupabaseServerClient: () => ({
        supabaseClient: supabase,
        headers: new Headers(),
      }),
    }));
    vi.doMock("../app/lib/database.server", () => ({
      safeParseJson: async () => ({
        user_id: "u1",
        caller_id: "+1555",
        campaign_id: 1,
        workspace_id: "w1",
        selected_device: "computer",
      }),
      createWorkspaceTwilioInstance: async () => ({
        calls: { create: callsCreate },
      }),
    }));
    vi.doMock("@/lib/env.server", () => ({
      env: { BASE_URL: () => "https://base.example" },
    }));
    vi.doMock("@/lib/logger.server", () => ({ logger }));

    const mod = await import("../app/routes/api.auto-dial");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial", {
        method: "POST",
      }),
    } as any);

    expect(res).toBeInstanceOf(Response);
    expect(logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.any(Error),
    );
  });
});
