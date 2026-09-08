import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  newKeysCreate: vi.fn(),
  accountsFetch: vi.fn(),
  twilioConstructorCalls: [] as Array<{ sid: string; token: string }>,
  syncSnapshot: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const dbState = vi.hoisted(() => ({
  workspace: {
    id: "w1",
    twilio_data: {} as unknown,
    key: null as string | null,
    token: null as string | null,
  },
  updateCalls: [] as Array<Record<string, unknown>>,
}));

const adminDb = vi.hoisted(() => {
  const readRow = async () => [{ ...dbState.workspace }];
  const afterWhere: any = { limit: readRow, for: () => ({ limit: readRow }) };
  const client: any = {
    select: () => ({ from: () => ({ where: () => afterWhere }) }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          dbState.updateCalls.push(set);
          if (set.twilio_data != null) {
            dbState.workspace.twilio_data =
              typeof set.twilio_data === "string"
                ? JSON.parse(set.twilio_data)
                : set.twilio_data;
          }
          if (set.key !== undefined) dbState.workspace.key = set.key as string | null;
          if (set.token !== undefined) dbState.workspace.token = set.token as string | null;
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return client;
});

vi.mock("@/server/admin-db", () => ({ adminDb }));

vi.mock("twilio", () => ({
  default: {
    Twilio: function (sid: string, token: string) {
      mocks.twilioConstructorCalls.push({ sid, token });
      return {
        newKeys: { create: (...args: unknown[]) => mocks.newKeysCreate(...args) },
        api: {
          v2010: {
            accounts: (accountSid: string) => ({
              fetch: () => mocks.accountsFetch(accountSid),
            }),
          },
        },
      };
    },
  },
}));

vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      TWILIO_SID: () => "ACmaster",
      TWILIO_AUTH_TOKEN: () => "master-secret",
    },
  };
});

vi.mock("@/lib/logger.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger.server")>();
  return { ...actual, logger: mocks.logger };
});

vi.mock("@/lib/database/workspace-twilio-sync.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/workspace-twilio-sync.server")>();
  return {
    ...actual,
    syncWorkspaceTwilioSnapshot: (...args: unknown[]) => mocks.syncSnapshot(...args),
  };
});

function setWorkspaceTwilioData(twilioData: unknown) {
  dbState.workspace.twilio_data = twilioData;
}

describe("twilio-subaccount-reauth server", () => {
  beforeEach(() => {
    vi.resetModules();
    dbState.workspace = { id: "w1", twilio_data: {}, key: null, token: null };
    dbState.updateCalls.length = 0;
    mocks.newKeysCreate.mockReset();
    mocks.accountsFetch.mockReset();
    mocks.twilioConstructorCalls.length = 0;
    mocks.syncSnapshot.mockReset();
    mocks.syncSnapshot.mockResolvedValue({
      lastSyncStatus: "healthy",
      lastSyncError: null,
    });
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
  });

  test("mints a fresh API key when the stored Auth Token is still valid", async () => {
    setWorkspaceTwilioData({ sid: "AC123", authToken: "still-good" });
    mocks.newKeysCreate.mockResolvedValue({ sid: "SKnew", secret: "new-secret" });
    const mod = await import("../app/lib/twilio-subaccount-reauth.server");

    const result = await mod.reauthenticateWorkspaceTwilioSubaccount({ workspaceId: "w1" });

    expect(result.authTokenRefreshedFromMaster).toBe(false);
    expect(result.newApiKeySid).toBe("SKnew");
    expect(result.syncSnapshot.lastSyncStatus).toBe("healthy");
    expect(dbState.workspace.key).toBe("SKnew");
    expect(dbState.workspace.token).toBe("new-secret");
    expect(mocks.accountsFetch).not.toHaveBeenCalled();
    expect(mocks.twilioConstructorCalls[0]).toEqual({ sid: "AC123", token: "still-good" });
    expect(mocks.syncSnapshot).toHaveBeenCalledWith({ workspaceId: "w1" });
  });

  test("refetches the Auth Token from the master account when it is rejected, then retries", async () => {
    setWorkspaceTwilioData({ sid: "AC123", authToken: "stale" });
    mocks.newKeysCreate
      .mockRejectedValueOnce(Object.assign(new Error("Authenticate"), { code: 20003 }))
      .mockResolvedValueOnce({ sid: "SKnew", secret: "new-secret" });
    mocks.accountsFetch.mockResolvedValue({ authToken: "fresh-from-master" });
    const mod = await import("../app/lib/twilio-subaccount-reauth.server");

    const result = await mod.reauthenticateWorkspaceTwilioSubaccount({ workspaceId: "w1" });

    expect(result.authTokenRefreshedFromMaster).toBe(true);
    expect(result.newApiKeySid).toBe("SKnew");
    expect(mocks.accountsFetch).toHaveBeenCalledWith("AC123");
    expect((dbState.workspace.twilio_data as any).authToken).toBe("fresh-from-master");
    expect(dbState.workspace.key).toBe("SKnew");
    expect(dbState.workspace.token).toBe("new-secret");
    // First attempt uses the stale stored token, master lookup uses master creds,
    // second mint attempt uses the freshly-refetched token.
    expect(mocks.twilioConstructorCalls).toEqual([
      { sid: "AC123", token: "stale" },
      { sid: "ACmaster", token: "master-secret" },
      { sid: "AC123", token: "fresh-from-master" },
    ]);
  });

  test("throws a clear error when the subaccount is unreachable even from the master account", async () => {
    setWorkspaceTwilioData({ sid: "AC123", authToken: "stale" });
    mocks.newKeysCreate.mockRejectedValueOnce(
      Object.assign(new Error("Authenticate"), { code: 20003 }),
    );
    mocks.accountsFetch.mockRejectedValueOnce(
      Object.assign(new Error("The requested resource was not found"), { code: 20404 }),
    );
    const mod = await import("../app/lib/twilio-subaccount-reauth.server");

    await expect(
      mod.reauthenticateWorkspaceTwilioSubaccount({ workspaceId: "w1" }),
    ).rejects.toThrow(/unreachable even from the master Twilio account/);
    expect(dbState.workspace.key).toBeNull();
    expect(mocks.syncSnapshot).not.toHaveBeenCalled();
  });

  test("does not attempt a master refetch for a non-authentication failure", async () => {
    setWorkspaceTwilioData({ sid: "AC123", authToken: "token" });
    mocks.newKeysCreate.mockRejectedValueOnce(
      Object.assign(new Error("Too Many Requests"), { status: 429 }),
    );
    const mod = await import("../app/lib/twilio-subaccount-reauth.server");

    await expect(
      mod.reauthenticateWorkspaceTwilioSubaccount({ workspaceId: "w1" }),
    ).rejects.toThrow("Could not mint a new Twilio API key");
    expect(mocks.accountsFetch).not.toHaveBeenCalled();
  });

  test("throws when the workspace has no Twilio credentials on file", async () => {
    setWorkspaceTwilioData({});
    const mod = await import("../app/lib/twilio-subaccount-reauth.server");

    await expect(
      mod.reauthenticateWorkspaceTwilioSubaccount({ workspaceId: "w1" }),
    ).rejects.toThrow("nothing to re-authenticate");
  });
});
