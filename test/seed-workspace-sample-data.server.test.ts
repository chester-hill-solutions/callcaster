import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  script: {
    insert: vi.fn(),
  },
  campaign: {
    insert: vi.fn(),
  },
}));

const createTenantDbMock = vi.hoisted(() => vi.fn(() => tdbMocks));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: createTenantDbMock,
}));

describe("app/lib/seed/seed-workspace-sample-data.server.ts", () => {
  beforeEach(() => {
    tdbMocks.script.insert.mockReset();
    tdbMocks.campaign.insert.mockReset();
    createTenantDbMock.mockClear();
  });

  test("seeds a script then a campaign linked via script_id", async () => {
    tdbMocks.script.insert.mockResolvedValueOnce([{ id: 42, name: "Sample script — customer check-in" }]);
    tdbMocks.campaign.insert.mockResolvedValueOnce([{ id: 7, script_id: 42 }]);

    const { seedWorkspaceSampleData } = await import(
      "../app/lib/seed/seed-workspace-sample-data.server"
    );
    const { SAMPLE_SCRIPT_STEPS } = await import(
      "../app/lib/seed/sample-script.server"
    );

    const result = await seedWorkspaceSampleData("w1", "u1");

    expect(createTenantDbMock).toHaveBeenCalledWith("w1");
    expect(tdbMocks.script.insert).toHaveBeenCalledWith({
      name: "Sample script — customer check-in",
      type: "script",
      steps: SAMPLE_SCRIPT_STEPS,
      created_by: "u1",
    });
    expect(tdbMocks.campaign.insert).toHaveBeenCalledWith({
      title: "Sample campaign — explore CallCaster",
      status: "draft",
      type: "live_call",
      caller_id: null,
      dial_ratio: 1,
      next_queue_order: 0,
      group_household_queue: false,
      is_active: false,
      script_id: 42,
    });
    // Campaign insert must happen after the script insert resolves, since it
    // depends on the seeded script's id.
    expect(tdbMocks.script.insert.mock.invocationCallOrder[0]).toBeLessThan(
      tdbMocks.campaign.insert.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      script: { id: 42, name: "Sample script — customer check-in" },
      campaign: { id: 7, script_id: 42 },
    });
  });

  test("throws when the script insert returns no row", async () => {
    tdbMocks.script.insert.mockResolvedValueOnce([]);

    const { seedWorkspaceSampleData } = await import(
      "../app/lib/seed/seed-workspace-sample-data.server"
    );

    await expect(seedWorkspaceSampleData("w1", "u1")).rejects.toThrow(
      "Failed to seed sample script",
    );
    expect(tdbMocks.campaign.insert).not.toHaveBeenCalled();
  });

  test("throws when the campaign insert returns no row", async () => {
    tdbMocks.script.insert.mockResolvedValueOnce([{ id: 42 }]);
    tdbMocks.campaign.insert.mockResolvedValueOnce([]);

    const { seedWorkspaceSampleData } = await import(
      "../app/lib/seed/seed-workspace-sample-data.server"
    );

    await expect(seedWorkspaceSampleData("w1", "u1")).rejects.toThrow(
      "Failed to seed sample campaign",
    );
  });
});

describe("app/lib/database/workspace-provisioning.server.ts createNewWorkspace + sample data seeding", () => {
  // createNewWorkspace rejects non-uuid auth user ids (legacy nanoid rows cannot be
  // mirrored into public.user / cast for the create_new_workspace RPC), so this
  // fixture must be a real uuid like Better Auth's generateId=crypto.randomUUID().
  const AUTH_USER_ID = "3f8b1c2a-5d4e-4f6a-9b7c-8e1d2a3b4c5d";

  const workspaceDbMocks = vi.hoisted(() => ({
    seedWorkspaceSampleData: vi.fn(),
  }));

  beforeEach(() => {
    vi.resetModules();
    workspaceDbMocks.seedWorkspaceSampleData.mockReset();

    vi.doMock("@/lib/seed/seed-workspace-sample-data.server", () => ({
      seedWorkspaceSampleData: workspaceDbMocks.seedWorkspaceSampleData,
    }));

    vi.doMock("@/server/admin-db", () => ({
      adminDb: {
        query: {
          workspace: { findFirst: vi.fn() },
        },
        select: () => ({
          from: () => ({
            innerJoin: () => ({ where: () => ({ orderBy: () => [] }) }),
            where: () => ({ limit: async () => [] }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: vi.fn(async () => undefined),
          }),
        }),
      },
    }));

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => ({})),
      withAppCurrentUser: vi.fn((userId: string, fn: (tx: unknown) => unknown) => fn({})),
    }));

    vi.doMock("@/components/workspace/TeamMember", () => ({
      MemberRole: { Owner: "owner", Admin: "admin", Member: "member", Caller: "caller" },
    }));

    vi.doMock("@/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    vi.doMock("@/lib/database/stripe.server", () => ({
      createStripeContact: vi.fn(async () => ({ id: "cus_1" })),
    }));

    vi.doMock("@/lib/env.server", () => ({
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

    vi.doMock("@/lib/db-rpc.server", () => ({
      rpcCreateNewWorkspace: vi.fn(async () => "w_new"),
      rpcGetWorkspaceUsers: vi.fn(),
      rpcUpdateUserWorkspaceLastAccessTime: vi.fn(),
    }));

    vi.doMock("@/lib/twilio-bootstrap.server", () => ({
      ensureWorkspaceTwilioBootstrap: vi.fn(async () => undefined),
    }));

    vi.doMock("twilio", () => {
      const TwilioCtor = function (this: unknown) {
        return {
          newKeys: { create: vi.fn(async () => ({ sid: "SK1", secret: "sec" })) },
          api: {
            v2010: {
              accounts: {
                create: vi.fn(async () => ({ sid: "AC_sub", authToken: "tok" })),
              },
            },
          },
        };
      } as unknown as new (...args: unknown[]) => unknown;
      return { default: { Twilio: TwilioCtor } };
    });
  });

  test("createNewWorkspace still succeeds when sample data seeding throws", async () => {
    workspaceDbMocks.seedWorkspaceSampleData.mockRejectedValueOnce(
      new Error("insert failed"),
    );

    const mod = await import("../app/lib/database/workspace-provisioning.server");
    const result = await mod.createNewWorkspace({
      workspaceName: "W",
      user_id: AUTH_USER_ID,
    });

    expect(result.data).toBe("w_new");
    expect(result.error).toBeNull();
    expect(result.provisioningWarning).toContain("Sample data seeding failed");
    expect(workspaceDbMocks.seedWorkspaceSampleData).toHaveBeenCalledWith(
      "w_new",
      AUTH_USER_ID,
    );
  });

  test("createNewWorkspace calls seedWorkspaceSampleData and reports no seeding warning on success", async () => {
    workspaceDbMocks.seedWorkspaceSampleData.mockResolvedValueOnce({
      script: { id: 1 },
      campaign: { id: 2 },
    });

    const mod = await import("../app/lib/database/workspace-provisioning.server");
    const result = await mod.createNewWorkspace({
      workspaceName: "W",
      user_id: AUTH_USER_ID,
    });

    expect(result.data).toBe("w_new");
    expect(result.provisioningWarning ?? "").not.toContain(
      "Sample data seeding failed",
    );
  });
});
