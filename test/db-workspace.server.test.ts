import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const objectStorageMocks = vi.hoisted(() => ({
  createSignedObjectUrl: vi.fn(async () => "u"),
  listObjects: vi.fn(async () => [{ name: "a", id: "a", created_at: "t", updated_at: "t" }]),
}));

vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...args: unknown[]) =>
    objectStorageMocks.createSignedObjectUrl(...args),
  listObjects: (...args: unknown[]) => objectStorageMocks.listObjects(...args),
}));

const adminDbMocks = vi.hoisted(() => ({
  workspaceFindFirst: vi.fn(),
  selectChain: vi.fn(),
  updateWhere: vi.fn(),
}));

const tdbMocks = vi.hoisted(() => ({
  workspace_number: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  workspace_users: {
    findFirst: vi.fn(),
    insert: vi.fn(),
  },
  workspace_invite: {
    delete: vi.fn(),
  },
  campaign: {
    findMany: vi.fn(),
  },
  audience: {
    findMany: vi.fn(),
  },
  script: {
    findMany: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
  },
  contact: {
    findMany: vi.fn(),
  },
}));

const authApiMocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: { api: authApiMocks },
}));

vi.mock("@/lib/better-auth-headers.server", () => ({
  mergeBetterAuthSetCookieHeaders: vi.fn((headers) => headers ?? new Headers()),
}));

const rpcMocks = vi.hoisted(() => ({
  rpcCreateNewWorkspace: vi.fn(),
  rpcFindContactsByPhones: vi.fn(),
  rpcGetWorkspaceUsers: vi.fn(),
  rpcUpdateUserWorkspaceLastAccessTime: vi.fn(),
}));

vi.mock("@/lib/db-rpc.server", () => rpcMocks);

function mockConversationTenantData({
  workspaceNumbers = [{ phone_number: "+15551111111" }],
  messageRows = [],
  contactRows = [],
}: {
  workspaceNumbers?: Array<{ phone_number: string }>;
  messageRows?: unknown[];
  contactRows?: unknown[];
}) {
  tdbMocks.workspace_number.findMany.mockResolvedValue(workspaceNumbers);
  tdbMocks.message.findMany.mockResolvedValue(messageRows);
  tdbMocks.contact.findMany.mockResolvedValue(contactRows);
  rpcMocks.rpcFindContactsByPhones.mockResolvedValue(contactRows);
}

describe("app/lib/database/workspace.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    objectStorageMocks.createSignedObjectUrl.mockReset();
    objectStorageMocks.listObjects.mockReset();
    objectStorageMocks.createSignedObjectUrl.mockResolvedValue("u");
    objectStorageMocks.listObjects.mockResolvedValue([
      { name: "a", id: "a", created_at: "t", updated_at: "t" },
    ]);

    adminDbMocks.workspaceFindFirst.mockReset();
    adminDbMocks.selectChain.mockReset();
    adminDbMocks.updateWhere.mockReset();
    authApiMocks.verifyEmail.mockReset();
    for (const fn of Object.values(rpcMocks)) {
      fn.mockReset();
    }
    for (const table of Object.values(tdbMocks)) {
      for (const fn of Object.values(table)) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }

    vi.doMock("@/server/admin-db", () => ({
      adminDb: {
        query: {
          workspace: { findFirst: adminDbMocks.workspaceFindFirst },
        },
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                orderBy: () => adminDbMocks.selectChain(),
              }),
            }),
            where: () => adminDbMocks.selectChain(),
          }),
        }),
        update: () => ({
          set: () => ({
            where: adminDbMocks.updateWhere,
          }),
        }),
      },
    }));

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
      withAppCurrentUser: vi.fn((userId, fn) => fn({} as any)),
    }));

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
          get: (_target, prop: string) => () => {
            if (prop === "BETTER_AUTH_URL" || prop === "BASE_URL") {
              return "http://localhost";
            }
            return "test";
          },
        },
      ),
    }));

    // Twilio is used via `new Twilio.Twilio(...)` and then various subresources.
    vi.doMock("twilio", () => {
      const newKeysCreate = vi.fn(async () => ({ sid: "SK1", secret: "sec" }));
      const accountsCreate = vi.fn(async () => ({
        sid: "AC_sub",
        authToken: "tok",
      }));

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

    await expect(
      mod.getUserWorkspaces({ userId: "" }),
    ).resolves.toEqual({
      data: null,
      error: "No user session found",
    });

    adminDbMocks.selectChain.mockRejectedValueOnce(new Error("x"));
    const res = await mod.getUserWorkspaces({ userId: "u1" });
    expect(res.data).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  }, 30000);

  test("getUserWorkspaces: success path does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    adminDbMocks.selectChain.mockResolvedValueOnce([{ workspace: { id: 1 } }]);
    const res = await mod.getUserWorkspaces({ userId: "u1" });
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("createKeys: returns newKey; logs+throws on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const Twilio = (await import("twilio")).default as any;
    const mod = await import("../app/lib/database/workspace.server");

    const ok = await mod.createKeys({
      workspace_id: "w1",
      sid: "AC",
      token: "tok",
    });
    expect(ok).toMatchObject({ sid: "SK1", secret: "sec" });

    Twilio.__mocks.newKeysCreate.mockRejectedValueOnce(new Error("bad"));
    await expect(
      mod.createKeys({ workspace_id: "w1", sid: "AC", token: "tok" }),
    ).rejects.toThrow("bad");
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

    rpcMocks.rpcCreateNewWorkspace.mockResolvedValue("w_new");

    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toEqual({
      data: "w_new",
      error: null,
      provisioningWarning: "Twilio bootstrap is still running",
    });
    expect(stripe.createStripeContact).toHaveBeenCalled();

    // rpc error now aborts before any provisioning
    rpcMocks.rpcCreateNewWorkspace.mockRejectedValueOnce(new Error("rpc"));
    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toMatchObject({ data: null, error: "rpc" });
    expect(logger.error).toHaveBeenCalled();

    // metadata update error is non-fatal; workspace is still created with a warning
    rpcMocks.rpcCreateNewWorkspace.mockResolvedValue("w_new");
    adminDbMocks.updateWhere.mockRejectedValueOnce(new Error("upd"));
    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toMatchObject({
      data: "w_new",
      error: null,
      provisioningWarning: expect.stringContaining(
        "Workspace provisioning metadata update failed",
      ),
    });

    const Twilio = (await import("twilio")).default as any;

    // Subaccount creation fails => workspace still created with warning
    rpcMocks.rpcCreateNewWorkspace.mockResolvedValue("w_new");
    Twilio.__mocks.accountsCreate.mockRejectedValueOnce(new Error("nope"));
    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toMatchObject({
      data: "w_new",
      error: null,
      provisioningWarning: expect.stringContaining("Twilio subaccount was not created"),
    });

    // Keys creation returns falsy without throwing
    Twilio.__mocks.newKeysCreate.mockResolvedValueOnce(undefined);
    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toMatchObject({
      data: "w_new",
      error: null,
      provisioningWarning: expect.stringContaining("Twilio API keys were not created"),
    });

    // Non-Error throws => generic message branch
    rpcMocks.rpcCreateNewWorkspace.mockRejectedValueOnce("boom");
    await expect(
      mod.createNewWorkspace({
        workspaceName: "W",
        user_id: "u1",
      }),
    ).resolves.toEqual({
      data: null,
      error: "An unexpected error occurred",
      provisioningWarning: null,
    });
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceInfo validates workspaceId and logs on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    await expect(
      mod.getWorkspaceInfo({
        workspaceId: undefined,
      }),
    ).resolves.toEqual({
      error: "No workspace id",
    });

    adminDbMocks.workspaceFindFirst.mockRejectedValueOnce(new Error("x"));
    const res = await mod.getWorkspaceInfo({
      workspaceId: "w1",
    });
    expect(res.data).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceInfo success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    adminDbMocks.workspaceFindFirst.mockResolvedValueOnce({ name: "W" });
    const res = await mod.getWorkspaceInfo({
      workspaceId: "w1",
    });
    expect(res).toEqual({ data: { name: "W" }, error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("getWorkspaceInfoWithDetails returns shaped object; throws on error", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    adminDbMocks.workspaceFindFirst.mockResolvedValueOnce(null);
    await expect(
      mod.getWorkspaceInfoWithDetails({
        workspaceId: "w1",
        userId: "u1",
      }),
    ).rejects.toMatchObject({ code: "PGRST116" });

    adminDbMocks.workspaceFindFirst.mockResolvedValueOnce({
      id: "w1",
      name: "W",
      credits: 0,
    });
    tdbMocks.workspace_users.findFirst.mockResolvedValueOnce({
      id: 1,
      role: "admin",
    });
    tdbMocks.campaign.findMany.mockResolvedValueOnce([{ id: 1 }]);
    tdbMocks.workspace_number.findMany.mockResolvedValueOnce([{ id: 1 }]);
    tdbMocks.audience.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const out = await mod.getWorkspaceInfoWithDetails({
      workspaceId: "w1",
      userId: "u1",
    });
    expect(out).toMatchObject({
      workspace: {
        id: "w1",
        name: "W",
        credits: 0,
        workspace_users: [{ role: "admin" }],
      },
      campaigns: [{ id: 1 }],
      phoneNumbers: [{ id: 1 }],
      audiences: [{ id: 1 }],
    });
  });

  test("getWorkspaceUsers + getWorkspacePhoneNumbers log on error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    rpcMocks.rpcGetWorkspaceUsers.mockRejectedValueOnce(new Error("x"));
    tdbMocks.workspace_number.findMany.mockRejectedValueOnce(new Error("y"));

    await mod.getWorkspaceUsers({
      workspaceId: "w1",
    });
    await mod.getWorkspacePhoneNumbers({
      workspaceId: "w1",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceUsers + getWorkspacePhoneNumbers success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    rpcMocks.rpcGetWorkspaceUsers.mockResolvedValue([{ id: 1 }]);
    tdbMocks.workspace_number.findMany.mockResolvedValueOnce([{ id: 1 }]);

    await mod.getWorkspaceUsers({
      workspaceId: "w1",
    });
    await mod.getWorkspacePhoneNumbers({
      workspaceId: "w1",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("updateWorkspacePhoneNumber returns {data,error}", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    tdbMocks.workspace_number.update.mockResolvedValueOnce([{ id: 1 }]);
    const res = await mod.updateWorkspacePhoneNumber({
      workspaceId: "w1",
      numberId: "n1",
      updates: { type: "rented" } as any,
    });
    expect(res).toEqual({ data: { id: 1 }, error: null });
  });

  test("addUserToWorkspace returns error object on insert error; success otherwise", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    tdbMocks.workspace_users.insert.mockRejectedValueOnce(new Error("x"));
    const r1 = await mod.addUserToWorkspace({
      workspaceId: "w1",
      userId: "u1",
      role: "member",
    });
    expect(r1.data).toBeNull();
    expect(r1.error).toBeTruthy();
    expect(logger.error).toHaveBeenCalled();

    tdbMocks.workspace_users.insert.mockResolvedValueOnce([{ id: 1 }]);
    const r2 = await mod.addUserToWorkspace({
      workspaceId: "w1",
      userId: "u1",
      role: "member",
    });
    expect(r2).toEqual({ data: { id: 1 }, error: null });
  });

  test("getUserRole handles missing user and logs on query error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");

    await expect(
      mod.getUserRole({
        user: null as any,
        workspaceId: "w1",
      }),
    ).resolves.toBeNull();

    tdbMocks.workspace_users.findFirst.mockRejectedValueOnce(new Error("x"));
    const role = await mod.getUserRole({
      user: { id: "u1" } as any,
      workspaceId: "w1",
    });
    expect(role).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test("requireWorkspaceAccess throws AppError when role missing/forbidden, passes for allowed", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    tdbMocks.workspace_users.findFirst.mockResolvedValueOnce({ role: "invited" });
    await expect(
      mod.requireWorkspaceAccess({
        user: { id: "u1" },
        workspaceId: "w1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    tdbMocks.workspace_users.findFirst.mockResolvedValueOnce({ role: "admin" });
    await expect(
      mod.requireWorkspaceAccess({
        user: { id: "u1" },
        workspaceId: "w1",
      }),
    ).resolves.toBeUndefined();
  });

  test("updateUserWorkspaceAccessDate logs on rpc error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    rpcMocks.rpcUpdateUserWorkspaceLastAccessTime.mockRejectedValue(
      new Error("x"),
    );
    await mod.updateUserWorkspaceAccessDate({
      workspaceId: "w1",
      userId: "u1",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  test("updateUserWorkspaceAccessDate success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/workspace.server");
    rpcMocks.rpcUpdateUserWorkspaceLastAccessTime.mockResolvedValue(undefined);
    await mod.updateUserWorkspaceAccessDate({
      workspaceId: "w1",
      userId: "u1",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("handleExistingUserSession returns json for invites or error", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const headers = new Headers();
    const serverSession: any = { user: { id: "u1" } };

    adminDbMocks.selectChain.mockRejectedValueOnce(new Error("x"));
    const r1 = await asRouteResponse(await mod.handleExistingUserSession(
      serverSession,
      headers,
    ));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ invites: [], newSession: null });

    adminDbMocks.selectChain.mockResolvedValueOnce([{ id: 1 }]);
    const r2 = await asRouteResponse(await mod.handleExistingUserSession(
      serverSession,
      headers,
    ));
    expect(await r2.json()).toMatchObject({
      newSession: serverSession,
      error: null,
    });
  });

  test("handleNewUserOTPVerification covers all branches", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const headers = new Headers();

    const makeRequest = () =>
      new Request("http://localhost/verify", { headers: new Headers() });

    const r0 = await asRouteResponse(
      await mod.handleNewUserOTPVerification(makeRequest(), "", "signup", headers),
    );
    expect(await r0.json()).toEqual({ error: "Invalid invitation link" });
    expect(authApiMocks.verifyEmail).not.toHaveBeenCalled();

    authApiMocks.verifyEmail.mockRejectedValueOnce(new Error("verify"));
    const r1 = await asRouteResponse(
      await mod.handleNewUserOTPVerification(makeRequest(), "th", "signup", headers),
    );
    expect(((await r1.json()) as any).error).toBeTruthy();

    authApiMocks.verifyEmail.mockResolvedValueOnce({ response: null });
    const r2 = await asRouteResponse(
      await mod.handleNewUserOTPVerification(makeRequest(), "th", "signup", headers),
    );
    expect(await r2.json()).toEqual({ error: "Failed to create session" });

    authApiMocks.verifyEmail.mockResolvedValueOnce({
      response: { user: { id: "u1" } },
    });
    adminDbMocks.selectChain.mockRejectedValueOnce(new Error("inv"));
    const r3 = await asRouteResponse(
      await mod.handleNewUserOTPVerification(makeRequest(), "th", "signup", headers),
    );
    expect(((await r3.json()) as any).error).toBeTruthy();

    authApiMocks.verifyEmail.mockResolvedValueOnce({
      response: { user: { id: "u1" } },
    });
    adminDbMocks.selectChain.mockResolvedValueOnce([{ id: 1 }]);
    const r4 = await asRouteResponse(
      await mod.handleNewUserOTPVerification(makeRequest(), "th", "signup", headers),
    );
    expect(await r4.json()).toMatchObject({
      newSession: { user: { id: "u1" } },
      invites: [{ id: 1 }],
    });
    expect(authApiMocks.verifyEmail).toHaveBeenLastCalledWith({
      query: { token: "th" },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
  });

  test("createWorkspaceTwilioInstance throws on query error and returns twilio instance on success", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    adminDbMocks.workspaceFindFirst.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.createWorkspaceTwilioInstance({
        workspace_id: "w1",
      }),
    ).rejects.toThrow("x");

    adminDbMocks.workspaceFindFirst.mockResolvedValueOnce({
      twilio_data: { sid: "AC", authToken: "tok" },
      key: null,
      token: null,
    });
    const twilio = await mod.createWorkspaceTwilioInstance({
      workspace_id: "w1",
    });
    expect(twilio).toMatchObject({ outgoingCallerIds: expect.any(Function) });
  });

  test("removeWorkspacePhoneNumber handles errors and success path", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const Twilio = (await import("twilio")).default as any;

    tdbMocks.workspace_number.findFirst.mockResolvedValue({
      friendly_name: "FN",
      phone_number: "+1",
    });
    adminDbMocks.workspaceFindFirst.mockResolvedValue({
      twilio_data: { sid: "AC", authToken: "tok" },
      key: "k",
      token: "t",
    });
    tdbMocks.workspace_number.delete.mockResolvedValue(undefined);

    const ok = await mod.removeWorkspacePhoneNumber({
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(ok).toEqual({ error: null });
    expect(Twilio.__mocks.outgoingList).toHaveBeenCalled();
    expect(Twilio.__mocks.incomingList).toHaveBeenCalled();

    tdbMocks.workspace_number.findFirst.mockResolvedValueOnce({
      friendly_name: "",
      phone_number: "+1",
    });
    const r2 = await mod.removeWorkspacePhoneNumber({
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(r2.error).toBeTruthy();

    tdbMocks.workspace_number.findFirst.mockResolvedValueOnce(null);
    const r3 = await mod.removeWorkspacePhoneNumber({
      workspaceId: "w1",
      numberId: 1n as any,
    });
    expect(r3.error).toBeTruthy();

    tdbMocks.workspace_number.findFirst.mockResolvedValueOnce({
      friendly_name: "FN",
      phone_number: "+1",
    });
    tdbMocks.workspace_number.delete.mockRejectedValueOnce(new Error("del"));
    const r4 = await mod.removeWorkspacePhoneNumber({
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
        null: {} as any,
        workspaceId: "w1",
        number: null as any,
        friendly_name: "X",
      }),
    ).resolves.toEqual({ error: null });

    adminDbMocks.workspaceFindFirst.mockResolvedValue({
      twilio_data: { sid: "AC", authToken: "tok" },
      key: null,
      token: null,
    });

    await mod.updateCallerId({
      workspaceId: "w1",
      number: { phone_number: "+1555" } as any,
      friendly_name: "FN",
    });
    expect(Twilio.__mocks.outgoingUpdate).toHaveBeenCalled();
    expect(Twilio.__mocks.incomingUpdate).toHaveBeenCalled();

    Twilio.__mocks.outgoingList.mockRejectedValueOnce(new Error("x"));
    adminDbMocks.workspaceFindFirst.mockResolvedValue({
      twilio_data: { sid: "AC", authToken: "tok" },
      key: null,
      token: null,
    });
    const res = await mod.updateCallerId({
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

    adminDbMocks.workspaceFindFirst.mockResolvedValueOnce({ id: "w1" });
    tdbMocks.workspace_number.findMany.mockResolvedValueOnce([]);
    const w = await mod.fetchWorkspaceData("w1");
    expect(w).toMatchObject({ workspace: { id: "w1" } });

    tdbMocks.script.findMany.mockRejectedValueOnce(new Error("x"));
    const scripts = await mod.getWorkspaceScripts({
      workspace: "w1",
    });
    expect(scripts).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();

    tdbMocks.script.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const scriptsOk = await mod.getWorkspaceScripts({
      workspace: "w1",
    });
    expect(scriptsOk).toEqual([{ id: 1 }]);

    expect(mod.getRecordingFileNames("no" as any)).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
    expect(
      mod.getRecordingFileNames([
        { speechType: "recorded", say: "f.wav" } as any,
      ]),
    ).toEqual(["f.wav"]);
    expect(
      mod.getRecordingFileNames([{ speechType: "text", say: "x" } as any]),
    ).toEqual([]);
    expect(
      mod.getRecordingFileNames([
        { speechType: "recorded", say: "Enter your question here" } as any,
      ]),
    ).toEqual([]);

    await expect(mod.getMedia(["a.wav"], "w1")).resolves.toEqual([
      { "a.wav": "u" },
    ]);
    objectStorageMocks.createSignedObjectUrl.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.getMedia(["a.wav"], "w1"),
    ).rejects.toThrow("x");

    objectStorageMocks.listObjects.mockRejectedValueOnce(new Error("x"));
    await expect(mod.listMedia("w1")).resolves.toEqual(null);
    expect(logger.error).toHaveBeenCalled();
    objectStorageMocks.listObjects.mockResolvedValueOnce([
      { name: "a", id: "a", created_at: "t", updated_at: "t" },
    ]);
    await expect(mod.listMedia("w1")).resolves.toEqual([
      { name: "a", id: "a", created_at: "t", updated_at: "t" },
    ]);

    await expect(mod.getSignedUrls("w1", ["m.png"])).resolves.toEqual(
      ["u"],
    );
    objectStorageMocks.createSignedObjectUrl.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.getSignedUrls("w1", ["m.png"]),
    ).rejects.toThrow("x");
  });

  test("acceptWorkspaceInvitations aggregates per-invitation errors after batched fetch", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    adminDbMocks.selectChain.mockResolvedValueOnce([
      { id: "i1", workspace: "w1", role: "member" },
      { id: "i2", workspace: "w2", role: "member" },
    ]);
    tdbMocks.workspace_users.insert.mockRejectedValue(new Error("join"));
    tdbMocks.workspace_invite.delete.mockResolvedValue(undefined);

    const out = await mod.acceptWorkspaceInvitations(["i1", "i2"], "u1");
    expect(out.errors).toEqual(
      expect.arrayContaining([
        { invitationId: "i1", type: "workspace" },
        { invitationId: "i2", type: "workspace" },
      ]),
    );
  });

  test("acceptWorkspaceInvitations success path has empty errors", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    adminDbMocks.selectChain.mockResolvedValueOnce([
      { id: "i1", workspace: "w1", role: "member" },
    ]);
    tdbMocks.workspace_users.insert.mockResolvedValueOnce([{ id: 1 }]);
    tdbMocks.workspace_invite.delete.mockResolvedValue(undefined);

    const out = await mod.acceptWorkspaceInvitations(["i1"], "u1");
    expect(out.errors).toEqual([]);
  });

  test("acceptWorkspaceInvitations marks missing invites as invite errors", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    adminDbMocks.selectChain.mockResolvedValueOnce([
      { id: "i1", workspace: "w1", role: "member" },
    ]);
    tdbMocks.workspace_users.insert.mockResolvedValueOnce([{ id: 1 }]);
    tdbMocks.workspace_invite.delete.mockResolvedValue(undefined);

    const out = await mod.acceptWorkspaceInvitations(["i1", "missing"], "u1");
    expect(out.errors).toContainEqual({
      invitationId: "missing",
      type: "invite",
    });
  });

  test("getInvitesByUserId throws on error and returns data on success", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    adminDbMocks.selectChain.mockRejectedValueOnce(new Error("x"));
    await expect(mod.getInvitesByUserId("u1")).rejects.toThrow("x");

    adminDbMocks.selectChain.mockResolvedValueOnce([{ id: 1 }]);
    await expect(mod.getInvitesByUserId("u1")).resolves.toEqual([{ id: 1 }]);
  });

  test("fetchConversationSummary paginates and applies campaign filtering", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    mockConversationTenantData({
      messageRows: [
        {
          campaign_id: 1,
          contact_id: 10,
          date_created: "2026-03-03T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000001",
        },
        {
          campaign_id: 1,
          contact_id: 10,
          date_created: "2026-03-01T00:00:00.000Z",
          direction: "inbound",
          from: "+15550000001",
          status: "received",
          to: "+15551111111",
        },
        {
          campaign_id: 1,
          contact_id: 11,
          date_created: "2026-03-02T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000002",
        },
      ],
      contactRows: [
        {
          id: 10,
          firstname: "Taylor",
          surname: "One",
          phone: "+15550000001",
        },
        {
          id: 11,
          firstname: "Jordan",
          surname: "Two",
          phone: "+15550000002",
        },
      ],
    });

    const result = await mod.fetchConversationSummary("w1", "1", {
      limit: 1,
      offset: 0,
      sort: "recent",
    });

    expect(tdbMocks.message.findMany).toHaveBeenCalled();
    expect(result.hasMore).toBe(true);
    expect(result.chats).toEqual([
      expect.objectContaining({
        contact_phone: "+15550000001",
        contact_firstname: "Taylor",
        contact_surname: "One",
        message_count: 2,
        unread_count: 1,
      }),
    ]);
  });

  test("fetchConversationSummary applies strict hasReplied filtering before pagination", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    mockConversationTenantData({
      messageRows: [
        {
          campaign_id: 1,
          contact_id: 10,
          date_created: "2026-03-05T00:00:00.000Z",
          direction: "inbound",
          from: "+15550000001",
          status: "received",
          to: "+15551111111",
        },
        {
          campaign_id: 1,
          contact_id: 11,
          date_created: "2026-03-04T00:00:00.000Z",
          direction: "inbound",
          from: "+15550000002",
          status: "read",
          to: "+15551111111",
        },
        {
          campaign_id: 1,
          contact_id: 12,
          date_created: "2026-03-03T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000003",
        },
      ],
      contactRows: [
        { id: 10, firstname: "Taylor", surname: "One", phone: "+15550000001" },
        { id: 11, firstname: "Jordan", surname: "Two", phone: "+15550000002" },
        { id: 12, firstname: "Casey", surname: "Three", phone: "+15550000003" },
      ],
    });

    const result = await mod.fetchConversationSummary("w1", null, {
      limit: 1,
      offset: 0,
      sort: "hasReplied",
    });

    expect(result.hasMore).toBe(true);
    expect(result.chats).toHaveLength(1);
    expect(result.chats[0]).toEqual(
      expect.objectContaining({
        contact_phone: "+15550000001",
      }),
    );
  });

  test("fetchConversationSummary applies strict hasUnreadReply filtering", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    mockConversationTenantData({
      messageRows: [
        {
          campaign_id: 1,
          contact_id: 10,
          date_created: "2026-03-05T00:00:00.000Z",
          direction: "inbound",
          from: "+15550000001",
          status: "received",
          to: "+15551111111",
        },
        {
          campaign_id: 1,
          contact_id: 11,
          date_created: "2026-03-04T00:00:00.000Z",
          direction: "inbound",
          from: "+15550000002",
          status: "read",
          to: "+15551111111",
        },
        {
          campaign_id: 1,
          contact_id: 12,
          date_created: "2026-03-03T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000003",
        },
      ],
      contactRows: [
        { id: 10, firstname: "Taylor", surname: "One", phone: "+15550000001" },
        { id: 11, firstname: "Jordan", surname: "Two", phone: "+15550000002" },
        { id: 12, firstname: "Casey", surname: "Three", phone: "+15550000003" },
      ],
    });

    rpcMocks.rpcFindContactsByPhones.mockResolvedValue([]);

    const result = await mod.fetchConversationSummary("w1", null, {
      limit: 20,
      offset: 0,
      sort: "hasUnreadReply",
    });

    expect(result.hasMore).toBe(false);
    expect(result.chats).toEqual([
      expect.objectContaining({
        contact_phone: "+15550000001",
        unread_count: 1,
      }),
    ]);
  });

  test("fetchConversationSummary ignores mismatched contact phone metadata", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    mockConversationTenantData({
      messageRows: [
        {
          campaign_id: 1,
          contact_id: 10,
          date_created: "2026-03-03T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000001",
        },
      ],
      contactRows: [
        {
          id: 10,
          firstname: "Wrong",
          surname: "Person",
          phone: "+15559999999",
        },
      ],
    });

    const result = await mod.fetchConversationSummary("w1", null, {
      limit: 20,
      offset: 0,
      sort: "recent",
    });

    expect(result.chats).toEqual([
      expect.objectContaining({
        contact_phone: "+15550000001",
        contact_firstname: null,
        contact_surname: null,
      }),
    ]);
  });

  test("fetchConversationSummary falls back to first phone-matched contact", async () => {
    const mod = await import("../app/lib/database/workspace.server");

    mockConversationTenantData({
      messageRows: [
        {
          campaign_id: 1,
          contact_id: null,
          date_created: "2026-03-03T00:00:00.000Z",
          direction: "outbound",
          from: "+15551111111",
          status: "delivered",
          to: "+15550000001",
        },
      ],
      contactRows: [],
    });

    rpcMocks.rpcFindContactsByPhones.mockResolvedValue([
      {
        id: 44,
        firstname: "Jamie",
        surname: "Fallback",
        phone: "+15550000001",
      },
    ]);

    const result = await mod.fetchConversationSummary("w1", null, {
      limit: 20,
      offset: 0,
      sort: "recent",
    });

    expect(rpcMocks.rpcFindContactsByPhones).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcFindContactsByPhones).toHaveBeenCalledWith("w1", [
      "+15550000001",
    ]);
    expect(result.chats).toEqual([
      expect.objectContaining({
        contact_phone: "+15550000001",
        contact_firstname: "Jamie",
        contact_surname: "Fallback",
      }),
    ]);
  });

  test("effective portal config prefers onboarding Messaging Service defaults when present", async () => {
    const mod = await import("../app/lib/database/workspace.server");
    const config = mod.getEffectiveWorkspaceTwilioPortalConfig({
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
