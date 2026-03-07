import { beforeEach, describe, expect, test, vi } from "vitest";

describe("app/lib/database/workspace.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock("@/components/workspace/TeamMember", () => ({
      MemberRole: {
        Owner: "owner",
        Admin: "admin",
        Member: "member",
        Caller: "caller",
      },
    }));

    vi.doMock("../app/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    vi.doMock("../app/lib/database/stripe.server", () => ({
      createStripeContact: vi.fn(async () => ({ id: "cus_1" })),
    }));

    vi.doMock("../app/lib/env.server", () => ({
      env: new Proxy(
        {},
        {
          get: (_target, _prop: string) => () => "test",
        },
      ),
    }));

    // Twilio is used via `new Twilio.Twilio(...)` and then various subresources.
    vi.doMock("twilio", () => {
      const newKeysCreate = vi.fn(async () => ({ sid: "SK1", secret: "sec" }));
      const accountsCreate = vi.fn(async () => ({ sid: "AC_sub", authToken: "tok" }));

      const outgoingRemove = vi.fn(async () => ({}));
      const incomingRemove = vi.fn(async () => ({}));
      const outgoingUpdate = vi.fn(async () => ({}));
      const incomingUpdate = vi.fn(async () => ({}));

      const outgoingList = vi.fn(async () => [{ sid: "OC1" }]);
      const incomingList = vi.fn(async () => [{ sid: "IN1" }]);

      const outgoingCallerIds: any = ((sid: string) => ({
        remove: () => (outgoingRemove as any)(sid),
        update: (p: any) => (outgoingUpdate as any)({ sid, ...p }),
      })) as any;
      outgoingCallerIds.list = (q: any) => (outgoingList as any)(q);

      const incomingPhoneNumbers: any = ((sid: string) => ({
        remove: () => (incomingRemove as any)(sid),
        update: (p: any) => (incomingUpdate as any)({ sid, ...p }),
      })) as any;
      incomingPhoneNumbers.list = (q: any) => (incomingList as any)(q);

      const TwilioCtor: any = function (_sid: string, _token: string) {
        return {
          newKeys: { create: newKeysCreate },
          api: { v2010: { accounts: { create: accountsCreate } } },
          outgoingCallerIds,
          incomingPhoneNumbers,
        };
      };

      return {
        default: {
          Twilio: TwilioCtor,
          __mocks: {
            newKeysCreate,
            accountsCreate,
            outgoingList,
            incomingList,
            outgoingRemove,
            incomingRemove,
            outgoingUpdate,
            incomingUpdate,
          },
        },
      };
    });
  });

  test("getUserWorkspaces: returns error when session missing; logs when query errors", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseNoSession: any = {
      auth: { getSession: async () => ({ data: { session: null } }) },
    };
    await expect(mod.getUserWorkspaces({ supabaseClient: supabaseNoSession })).resolves.toEqual({
      data: null,
      error: "No user session found",
    });

    const supabaseErr: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ id: 1 }], error: { message: "x" } }),
        }),
      }),
    };
    const res = await mod.getUserWorkspaces({ supabaseClient: supabaseErr });
    expect(res.data).toEqual([{ id: 1 }]);
    expect(logger.error).toHaveBeenCalled();
  }, 30000);

  test("getUserWorkspaces: success path does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseOk: any = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    const res = await mod.getUserWorkspaces({ supabaseClient: supabaseOk });
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("createKeys: returns newKey; logs+throws on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const Twilio = (await import("twilio")).default as any;
    const mod = await import("../app/lib/database/workspace.server");

    const ok = await mod.createKeys({ workspace_id: "w1", sid: "AC", token: "tok" });
    expect(ok).toMatchObject({ sid: "SK1", secret: "sec" });

    Twilio.__mocks.newKeysCreate.mockRejectedValueOnce(new Error("bad"));
    await expect(mod.createKeys({ workspace_id: "w1", sid: "AC", token: "tok" })).rejects.toThrow("bad");
    expect(logger.error).toHaveBeenCalled();
  });

  test("createSubaccount returns account; logs on create rejection", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const Twilio = (await import("twilio")).default as any;
    const mod = await import("../app/lib/database/workspace.server");

    const ok = await mod.createSubaccount({ workspace_id: "w1" });
    expect(ok).toMatchObject({ sid: "AC_sub", authToken: "tok" });

    Twilio.__mocks.accountsCreate.mockRejectedValueOnce(new Error("nope"));
    const res = await mod.createSubaccount({ workspace_id: "w2" });
    expect(res).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test("createNewWorkspace: happy path and failure cases", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const stripe = await import("../app/lib/database/stripe.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabase: any = {
      rpc: vi.fn(async () => ({ data: "w_new", error: null })),
      from: () => ({
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };

    await expect(
      mod.createNewWorkspace({ supabaseClient: supabase, workspaceName: "W", user_id: "u1" }),
    ).resolves.toEqual({ data: "w_new", error: null });
    expect(stripe.createStripeContact).toHaveBeenCalled();

    // rpc error is logged but flow can continue
    const supabaseRpcErr: any = {
      rpc: vi.fn(async () => ({ data: "w_new", error: new Error("rpc") })),
      from: () => ({
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };
    await mod.createNewWorkspace({ supabaseClient: supabaseRpcErr, workspaceName: "W", user_id: "u1" });
    expect(logger.error).toHaveBeenCalled();

    // update error bubbles into catch and returns message string
    const supabaseUpdateErr: any = {
      rpc: vi.fn(async () => ({ data: "w_new", error: null })),
      from: () => ({
        update: () => ({
          eq: async () => ({ error: new Error("upd") }),
        }),
      }),
    };
    await expect(
      mod.createNewWorkspace({ supabaseClient: supabaseUpdateErr, workspaceName: "W", user_id: "u1" }),
    ).resolves.toMatchObject({ data: null, error: "upd" });

    const Twilio = (await import("twilio")).default as any;

    // Subaccount creation fails => specific error
    Twilio.__mocks.accountsCreate.mockRejectedValueOnce(new Error("nope"));
    await expect(
      mod.createNewWorkspace({ supabaseClient: supabase, workspaceName: "W", user_id: "u1" }),
    ).resolves.toMatchObject({ data: null, error: "Failed to create Twilio subaccount" });

    // Keys creation returns falsy without throwing
    Twilio.__mocks.newKeysCreate.mockResolvedValueOnce(undefined);
    await expect(
      mod.createNewWorkspace({ supabaseClient: supabase, workspaceName: "W", user_id: "u1" }),
    ).resolves.toMatchObject({ data: null, error: "Failed to create Twilio API keys" });

    // Non-Error throws => generic message branch
    const supabaseThrows: any = {
      rpc: vi.fn(async () => {
        throw "boom";
      }),
    };
    await expect(
      mod.createNewWorkspace({ supabaseClient: supabaseThrows, workspaceName: "W", user_id: "u1" }),
    ).resolves.toEqual({ data: null, error: "An unexpected error occurred" });
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceInfo validates workspaceId and logs on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    await expect(mod.getWorkspaceInfo({ supabaseClient: {} as any, workspaceId: undefined })).resolves.toEqual({
      error: "No workspace id",
    });

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { name: "W" }, error: { details: "x" } }),
          }),
        }),
      }),
    };
    const res = await mod.getWorkspaceInfo({ supabaseClient: supabase, workspaceId: "w1" });
    expect(res.data).toEqual({ name: "W" });
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceInfo success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { name: "W" }, error: null }),
          }),
        }),
      }),
    };
    const res = await mod.getWorkspaceInfo({ supabaseClient: supabaseOk, workspaceId: "w1" });
    expect(res).toEqual({ data: { name: "W" }, error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("getWorkspaceInfoWithDetails returns shaped object; throws on error", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error("x") }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.getWorkspaceInfoWithDetails({ supabaseClient: supabaseErr, workspaceId: "w1", userId: "u1" }),
    ).rejects.toThrow("x");

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "w1",
                  name: "W",
                  credits: 0,
                  workspace_users: [{ role: "admin" }],
                  campaign: [{ id: 1 }],
                  workspace_number: [{ id: 1 }],
                  audience: [{ id: 1 }],
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    const out = await mod.getWorkspaceInfoWithDetails({ supabaseClient: supabaseOk, workspaceId: "w1", userId: "u1" });
    expect(out).toMatchObject({
      workspace: { id: "w1", name: "W", credits: 0, workspace_users: [{ role: "admin" }] },
      campaigns: [{ id: 1 }],
      phoneNumbers: [{ id: 1 }],
      audiences: [{ id: 1 }],
    });
  });

  test("getWorkspaceUsers + getWorkspacePhoneNumbers log on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabase: any = {
      rpc: async () => ({ data: [{ id: 1 }], error: new Error("x") }),
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: new Error("y") }),
        }),
      }),
    };

    await mod.getWorkspaceUsers({ supabaseClient: supabase, workspaceId: "w1" });
    await mod.getWorkspacePhoneNumbers({ supabaseClient: supabase, workspaceId: "w1" });
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceUsers + getWorkspacePhoneNumbers success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabase: any = {
      rpc: async () => ({ data: [{ id: 1 }], error: null }),
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    await mod.getWorkspaceUsers({ supabaseClient: supabase, workspaceId: "w1" });
    await mod.getWorkspacePhoneNumbers({ supabaseClient: supabase, workspaceId: "w1" });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("updateWorkspacePhoneNumber returns {data,error}", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const supabase: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: 1 }, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const res = await mod.updateWorkspacePhoneNumber({
      supabaseClient: supabase,
      workspaceId: "w1",
      numberId: "n1",
      updates: { type: "rented" } as any,
    });
    expect(res).toEqual({ data: { id: 1 }, error: null });
  });

  test("addUserToWorkspace returns error object on insert error; success otherwise", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseErr: any = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("x") }),
          }),
        }),
      }),
    };
    const r1 = await mod.addUserToWorkspace({
      supabaseClient: supabaseErr,
      workspaceId: "w1",
      userId: "u1",
      role: "member",
    });
    expect(r1.data).toBeNull();
    expect(r1.error).toBeTruthy();
    expect(logger.error).toHaveBeenCalled();

    const supabaseOk: any = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: 1 }, error: null }),
          }),
        }),
      }),
    };
    const r2 = await mod.addUserToWorkspace({
      supabaseClient: supabaseOk,
      workspaceId: "w1",
      userId: "u1",
      role: "member",
    });
    expect(r2).toEqual({ data: { id: 1 }, error: null });
  });

  test("getUserRole handles missing user and logs on query error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    await expect(mod.getUserRole({ supabaseClient: {} as any, user: null as any, workspaceId: "w1" })).resolves.toBeNull();

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error("x") }),
            }),
          }),
        }),
      }),
    };
    const role = await mod.getUserRole({ supabaseClient: supabase, user: { id: "u1" } as any, workspaceId: "w1" });
    expect(role).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test("requireWorkspaceAccess throws AppError when role missing/forbidden, passes for allowed", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseForbidden: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { role: "invited" }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.requireWorkspaceAccess({ supabaseClient: supabaseForbidden, user: { id: "u1" }, workspaceId: "w1" }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const supabaseAllowed: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { role: "admin" }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.requireWorkspaceAccess({ supabaseClient: supabaseAllowed, user: { id: "u1" }, workspaceId: "w1" }),
    ).resolves.toBeUndefined();
  });

  test("updateUserWorkspaceAccessDate logs on rpc error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    const supabase: any = { rpc: async () => ({ data: null, error: new Error("x") }) };
    await mod.updateUserWorkspaceAccessDate({ supabaseClient: supabase, workspaceId: "w1" });
    expect(logger.error).toHaveBeenCalled();
  });

  test("updateUserWorkspaceAccessDate success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    const supabase: any = { rpc: async () => ({ data: { ok: 1 }, error: null }) };
    await mod.updateUserWorkspaceAccessDate({ supabaseClient: supabase, workspaceId: "w1" });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("handleExistingUserSession returns json for invites or error", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const headers = new Headers();
    const serverSession: any = { user: { id: "u1" } };

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("x") }),
        }),
      }),
    };
    const r1 = await mod.handleExistingUserSession(supabaseErr, serverSession, headers);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ invites: [], newSession: null });

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    const r2 = await mod.handleExistingUserSession(supabaseOk, serverSession, headers);
    expect(await r2.json()).toMatchObject({ newSession: serverSession, error: null });
  });

  test("handleNewUserOTPVerification covers all branches", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const headers = new Headers();

    const supabaseNoHash: any = { auth: {} };
    const r0 = await mod.handleNewUserOTPVerification(supabaseNoHash, "", "signup" as any, headers);
    expect(await r0.json()).toEqual({ error: "Invalid invitation link" });

    const supabaseVerifyErr: any = {
      auth: { verifyOtp: async () => ({ data: null, error: new Error("x") }) },
    };
    const r1 = await mod.handleNewUserOTPVerification(supabaseVerifyErr, "th", "signup" as any, headers);
    expect((await r1.json() as any).error).toBeTruthy();

    const supabaseNoSession: any = {
      auth: { verifyOtp: async () => ({ data: { session: null }, error: null }) },
    };
    const r2 = await mod.handleNewUserOTPVerification(supabaseNoSession, "th", "signup" as any, headers);
    expect(await r2.json()).toEqual({ error: "Failed to create session" });

    const supabaseSessionErr: any = {
      auth: {
        verifyOtp: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
        setSession: async () => ({ error: new Error("set") }),
      },
    };
    const r3 = await mod.handleNewUserOTPVerification(supabaseSessionErr, "th", "signup" as any, headers);
    expect((await r3.json() as any).error).toBeTruthy();

    const supabaseInviteErr: any = {
      auth: {
        verifyOtp: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
        setSession: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("inv") }),
        }),
      }),
    };
    const r4 = await mod.handleNewUserOTPVerification(supabaseInviteErr, "th", "signup" as any, headers);
    expect((await r4.json() as any).error).toBeTruthy();

    const supabaseOk: any = {
      auth: {
        verifyOtp: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
        setSession: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    const r5 = await mod.handleNewUserOTPVerification(supabaseOk, "th", "signup" as any, headers);
    expect(await r5.json()).toMatchObject({ invites: [{ id: 1 }] });
  });

  test("createWorkspaceTwilioInstance throws on query error and returns twilio instance on success", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("x") }),
          }),
        }),
      }),
    };
    await expect(mod.createWorkspaceTwilioInstance({ supabase: supabaseErr, workspace_id: "w1" })).rejects.toThrow("x");

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { twilio_data: { sid: "AC", authToken: "tok" } }, error: null }),
          }),
        }),
      }),
    };
    const twilio = await mod.createWorkspaceTwilioInstance({ supabase: supabaseOk, workspace_id: "w1" });
    expect(twilio).toMatchObject({ outgoingCallerIds: expect.any(Function) });
  });

  test("removeWorkspacePhoneNumber handles errors and success path", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const Twilio = (await import("twilio")).default as any;

    const baseSupabase: any = {
      from: (table: string) => {
        if (table === "workspace_number") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { friendly_name: "FN", phone_number: "+1" }, error: null }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { twilio_data: { sid: "AC", authToken: "tok" }, key: "k", token: "t" },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    const ok = await mod.removeWorkspacePhoneNumber({
      supabaseClient: baseSupabase,
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(ok).toEqual({ error: null });
    expect(Twilio.__mocks.outgoingList).toHaveBeenCalled();
    expect(Twilio.__mocks.incomingList).toHaveBeenCalled();

    const supabaseNoName: any = {
      ...baseSupabase,
      from: (table: string) => {
        if (table === "workspace_number") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { friendly_name: "", phone_number: "+1" }, error: null }),
              }),
            }),
          };
        }
        return baseSupabase.from(table);
      },
    };
    const r2 = await mod.removeWorkspacePhoneNumber({
      supabaseClient: supabaseNoName,
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(r2.error).toBeTruthy();

    const supabaseNumberErr: any = {
      ...baseSupabase,
      from: (table: string) => {
        if (table === "workspace_number") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: new Error("num") }),
              }),
            }),
          };
        }
        return baseSupabase.from(table);
      },
    };
    const r3 = await mod.removeWorkspacePhoneNumber({
      supabaseClient: supabaseNumberErr,
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(r3.error).toBeTruthy();

    const supabaseDeleteErr: any = {
      ...baseSupabase,
      from: (table: string) => {
        if (table === "workspace_number") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { friendly_name: "FN", phone_number: "+1" }, error: null }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: new Error("del") }),
            }),
          };
        }
        return baseSupabase.from(table);
      },
    };
    const r4 = await mod.removeWorkspacePhoneNumber({
      supabaseClient: supabaseDeleteErr,
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(r4.error).toBeTruthy();
  });

  test("updateCallerId returns early without number; updates callerId names; logs on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    const Twilio = (await import("twilio")).default as any;

    await expect(
      mod.updateCallerId({
        supabaseClient: {} as any,
        workspaceId: "w1",
        number: null as any,
        friendly_name: "X",
      }),
    ).resolves.toEqual({ error: null });

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { twilio_data: { sid: "AC", authToken: "tok" } },
              error: null,
            }),
          }),
        }),
      }),
    };

    await mod.updateCallerId({
      supabaseClient: supabase,
      workspaceId: "w1",
      number: { phone_number: "+1555" } as any,
      friendly_name: "FN",
    });
    expect(Twilio.__mocks.outgoingUpdate).toHaveBeenCalled();
    expect(Twilio.__mocks.incomingUpdate).toHaveBeenCalled();

    Twilio.__mocks.outgoingList.mockRejectedValueOnce(new Error("x"));
    const res = await mod.updateCallerId({
      supabaseClient: supabase,
      workspaceId: "w1",
      number: { phone_number: "+1555" } as any,
      friendly_name: "FN",
    });
    expect(res).toMatchObject({ error: expect.anything() });
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchWorkspaceData, getWorkspaceScripts, and media helpers", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: "w1" }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "script") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: 1 }], error: new Error("x") }),
            }),
          };
        }
        throw new Error("unexpected");
      },
      storage: {
        from: () => ({
          createSignedUrl: async (_p: string) => ({ data: { signedUrl: "u" }, error: null }),
          list: async () => ({ data: [{ name: "a" }], error: new Error("x") }),
        }),
      },
    };

    const w = await mod.fetchWorkspaceData(supabase, "w1");
    expect(w).toMatchObject({ workspace: { id: "w1" } });

    const scripts = await mod.getWorkspaceScripts({ workspace: "w1", supabase });
    expect(scripts).toEqual([{ id: 1 }]);
    expect(logger.error).toHaveBeenCalled();

    const supabaseScriptsOk: any = {
      ...supabase,
      from: (table: string) => {
        if (table === "script") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: 1 }], error: null }),
            }),
          };
        }
        return supabase.from(table);
      },
    };
    const scriptsOk = await mod.getWorkspaceScripts({ workspace: "w1", supabase: supabaseScriptsOk });
    expect(scriptsOk).toEqual([{ id: 1 }]);

    expect(mod.getRecordingFileNames("no" as any)).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
    expect(mod.getRecordingFileNames([{ speechType: "recorded", say: "f.wav" } as any])).toEqual(["f.wav"]);
    expect(mod.getRecordingFileNames([{ speechType: "text", say: "x" } as any])).toEqual([]);
    expect(
      mod.getRecordingFileNames([{ speechType: "recorded", say: "Enter your question here" } as any]),
    ).toEqual([]);

    await expect(mod.getMedia(["a.wav"], supabase, "w1")).resolves.toEqual([{ "a.wav": "u" }]);
    const supabaseMediaErr: any = {
      ...supabase,
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: new Error("x") }),
        }),
      },
    };
    await expect(mod.getMedia(["a.wav"], supabaseMediaErr, "w1")).rejects.toThrow("x");

    await expect(mod.listMedia(supabase, "w1")).resolves.toEqual([{ name: "a" }]);
    expect(logger.error).toHaveBeenCalled();
    const supabaseListOk: any = {
      ...supabase,
      storage: {
        from: () => ({
          list: async () => ({ data: [{ name: "a" }], error: null }),
        }),
      },
    };
    await expect(mod.listMedia(supabaseListOk, "w1")).resolves.toEqual([{ name: "a" }]);

    await expect(mod.getSignedUrls(supabase, "w1", ["m.png"])).resolves.toEqual(["u"]);
    const supabaseSignedErr: any = {
      ...supabase,
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: new Error("x") }),
        }),
      },
    };
    await expect(mod.getSignedUrls(supabaseSignedErr, "w1", ["m.png"])).rejects.toThrow("x");
  });

  test("acceptWorkspaceInvitations aggregates errors (only processes first id due to early return)", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace_invite") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { workspace: "w1", role: "member" }, error: new Error("inv") }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: new Error("del") }),
            }),
          };
        }
        if (table === "workspace_users") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: new Error("join") }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };

    const out = await mod.acceptWorkspaceInvitations(supabase, ["i1", "i2"], "u1");
    expect(out.errors.length).toBeGreaterThan(0);
  });

  test("acceptWorkspaceInvitations success path has empty errors", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace_invite") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { workspace: "w1", role: "member" }, error: null }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "workspace_users") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 1 }, error: null }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    const out = await mod.acceptWorkspaceInvitations(supabase, ["i1"], "u1");
    expect(out.errors).toEqual([]);
  });

  test("getInvitesByUserId throws on error and returns data on success", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("x") }),
        }),
      }),
    };
    await expect(mod.getInvitesByUserId(supabaseErr, "u1")).rejects.toThrow("x");

    const supabaseOk: any = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ id: 1 }], error: null }),
        }),
      }),
    };
    await expect(mod.getInvitesByUserId(supabaseOk, "u1")).resolves.toEqual([{ id: 1 }]);
  });

  test("fetchConversationSummary uses correct rpc based on campaign_id", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    const rpc = vi.fn(async (_name: string) => ({ data: [{ id: 1 }], error: null }));
    const supabase: any = { rpc };

    await mod.fetchConversationSummary(supabase, "w1");
    expect(rpc).toHaveBeenCalledWith("get_conversation_summary", { p_workspace: "w1" });

    await mod.fetchConversationSummary(supabase, "w1", "1");
    expect(rpc).toHaveBeenCalledWith("get_conversation_summary_by_campaign", { p_workspace: "w1", campaign_id_prop: 1 });
  });

  test("portal config prefers onboarding Messaging Service defaults when present", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const config = mod.getWorkspaceTwilioPortalConfigFromTwilioData({
      sid: "AC123",
      authToken: "auth",
      portalConfig: {
        trafficClass: "unknown",
        throughputProduct: "none",
        multiTenancyMode: "none",
        trafficShapingEnabled: false,
        defaultMessageIntent: null,
        sendMode: "from_number",
        messagingServiceSid: null,
        onboardingStatus: "not_started",
        supportNotes: "",
        updatedAt: null,
        updatedBy: null,
        auditTrail: [],
      },
      onboarding: {
        version: 1,
        status: "in_review",
        currentStep: "provider_provisioning",
        selectedChannels: ["a2p10dlc"],
        steps: [],
        businessProfile: {
          legalBusinessName: "Acme",
          businessType: "llc",
          websiteUrl: "https://acme.test",
          privacyPolicyUrl: "",
          termsOfServiceUrl: "",
          supportEmail: "",
          supportPhone: "",
          useCaseSummary: "",
          optInWorkflow: "",
          optInKeywords: "",
          optOutKeywords: "",
          helpKeywords: "",
          sampleMessages: [],
        },
        messagingService: {
          desiredSendMode: "messaging_service",
          serviceSid: "MG123",
          friendlyName: "Acme Messaging",
          provisioningStatus: "live",
          attachedSenderPhoneNumbers: [],
          supportedChannels: ["a2p10dlc"],
          stickySenderEnabled: true,
          advancedOptOutEnabled: true,
          lastProvisionedAt: null,
          lastError: null,
        },
        subaccountBootstrap: {
          status: "live",
          authMode: "mixed",
          callbackBaseUrl: null,
          inboundVoiceUrl: null,
          inboundSmsUrl: null,
          statusCallbackUrl: null,
          createdResources: [],
          featureFlags: [],
          driftMessages: [],
          lastSyncedAt: null,
          lastError: null,
        },
        emergencyVoice: {
          status: "not_started",
          enabled: false,
          emergencyEligiblePhoneNumbers: [],
          ineligibleCallerIds: [],
          allowedCallerIdTypes: ["rented"],
          complianceNotes: "",
          address: {
            addressSid: null,
            customerName: "",
            street: "",
            city: "",
            region: "",
            postalCode: "",
            countryCode: "US",
            status: "not_started",
            validationError: null,
            lastValidatedAt: null,
          },
          lastReviewedAt: null,
        },
        a2p10dlc: {
          status: "in_review",
          brandSid: "BN123",
          campaignSid: null,
          trustProductSid: null,
          customerProfileBundleSid: null,
          brandType: null,
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
        rcs: {
          status: "not_started",
          provider: null,
          agentId: null,
          senderId: null,
          regions: [],
          prerequisites: [],
          notes: "",
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
        reviewState: {
          blockingIssues: [],
          lastError: null,
          lastUpdatedAt: null,
        },
        lastUpdatedAt: null,
        lastUpdatedBy: null,
      },
    } as any);

    expect(config.sendMode).toBe("messaging_service");
    expect(config.messagingServiceSid).toBe("MG123");
    expect(config.onboardingStatus).toBe("requested");
  });
});

