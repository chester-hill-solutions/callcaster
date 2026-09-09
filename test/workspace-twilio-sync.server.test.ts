import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  accountLevelFetch: vi.fn(),
  apiKeyAccountsFetch: vi.fn(),
  listNumbers: vi.fn(),
  listUsage: vi.fn(),
  twilioConstructorCalls: [] as Array<{ sid: string; token: string; usesApiKey: boolean }>,
  syncBootstrap: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  workspace: {
    id: "w1",
    twilio_data: {} as unknown,
    key: null as string | null,
    token: null as string | null,
  },
}));

const adminDb = vi.hoisted(() => {
  const readRow = async () => [{ ...dbState.workspace }];
  const afterWhere: any = { limit: readRow, for: () => ({ limit: readRow }) };
  const client: any = {
    select: () => ({ from: () => ({ where: () => afterWhere }) }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          if (set.twilio_data != null) {
            dbState.workspace.twilio_data =
              typeof set.twilio_data === "string"
                ? JSON.parse(set.twilio_data)
                : set.twilio_data;
          }
        },
      }),
    }),
    query: {
      workspace: {
        findFirst: async () => ({ ...dbState.workspace }),
      },
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return client;
});

vi.mock("@/server/admin-db", () => ({ adminDb }));

vi.mock("twilio", () => ({
  default: {
    Twilio: function (sid: string, tokenOrApiKey: string, opts?: { accountSid?: string }) {
      const usesApiKey = Boolean(opts?.accountSid);
      mocks.twilioConstructorCalls.push({ sid, token: tokenOrApiKey, usesApiKey });
      return {
        api: {
          v2010: {
            accounts: (accountSid: string) => ({
              fetch: () =>
                usesApiKey
                  ? mocks.apiKeyAccountsFetch(accountSid)
                  : mocks.accountLevelFetch(accountSid),
            }),
          },
        },
        incomingPhoneNumbers: { list: (...args: unknown[]) => mocks.listNumbers(...args) },
        usage: { records: { list: (...args: unknown[]) => mocks.listUsage(...args) } },
      };
    },
  },
}));

vi.mock("@/lib/twilio-bootstrap.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/twilio-bootstrap.server")>();
  return {
    ...actual,
    syncWorkspaceTwilioBootstrapState: (...args: unknown[]) => mocks.syncBootstrap(...args),
  };
});

function setWorkspace({
  twilioData,
  key = null,
  token = null,
}: {
  twilioData: unknown;
  key?: string | null;
  token?: string | null;
}) {
  dbState.workspace = { id: "w1", twilio_data: twilioData, key, token };
}

describe("workspace-twilio-sync server", () => {
  beforeEach(() => {
    vi.resetModules();
    setWorkspace({ twilioData: { sid: "AC123", authToken: "the-auth-token" } });
    mocks.accountLevelFetch.mockReset();
    mocks.apiKeyAccountsFetch.mockReset();
    mocks.listNumbers.mockReset();
    mocks.listNumbers.mockResolvedValue([]);
    mocks.listUsage.mockReset();
    mocks.listUsage.mockResolvedValue([]);
    mocks.twilioConstructorCalls.length = 0;
    mocks.syncBootstrap.mockReset();
    mocks.syncBootstrap.mockResolvedValue({});
  });

  test("fetches the Account resource with the Auth Token, not the workspace's API key", async () => {
    setWorkspace({
      twilioData: { sid: "AC123", authToken: "the-auth-token" },
      key: "SKapikey",
      token: "api-secret",
    });
    mocks.accountLevelFetch.mockResolvedValue({
      status: "active",
      friendlyName: "Workspace",
    });
    const mod = await import("../app/lib/database/workspace-twilio-sync.server");

    const snapshot = await mod.syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });

    expect(snapshot.lastSyncStatus).toBe("healthy");
    expect(snapshot.accountStatus).toBe("active");
    expect(mocks.accountLevelFetch).toHaveBeenCalledWith("AC123");
    expect(mocks.apiKeyAccountsFetch).not.toHaveBeenCalled();
    // The account-level client is constructed straight from sid + Auth Token
    // (no accountSid option, which is what marks the API-key construction).
    expect(
      mocks.twilioConstructorCalls.some(
        (call) => !call.usesApiKey && call.sid === "AC123" && call.token === "the-auth-token",
      ),
    ).toBe(true);
  });

  test("still works when the workspace has no API key on file (sid+authToken fallback everywhere)", async () => {
    setWorkspace({ twilioData: { sid: "AC123", authToken: "the-auth-token" } });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    const mod = await import("../app/lib/database/workspace-twilio-sync.server");

    const snapshot = await mod.syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });

    expect(snapshot.lastSyncStatus).toBe("healthy");
    expect(mocks.apiKeyAccountsFetch).not.toHaveBeenCalled();
  });

  test("records the sync error when the Auth Token itself is rejected", async () => {
    setWorkspace({
      twilioData: { sid: "AC123", authToken: "bad-token" },
      key: "SKapikey",
      token: "api-secret",
    });
    mocks.accountLevelFetch.mockRejectedValue(
      Object.assign(new Error("Authenticate"), { code: 20003 }),
    );
    const mod = await import("../app/lib/database/workspace-twilio-sync.server");

    const snapshot = await mod.syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });

    expect(snapshot.lastSyncStatus).toBe("error");
    expect(snapshot.lastSyncError).toBe("Authenticate");
  });

  test("reports missing-credentials error without calling Twilio", async () => {
    setWorkspace({ twilioData: {} });
    const mod = await import("../app/lib/database/workspace-twilio-sync.server");

    const snapshot = await mod.syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });

    expect(snapshot.lastSyncStatus).toBe("error");
    expect(snapshot.lastSyncError).toBe("Missing workspace Twilio credentials");
    expect(mocks.accountLevelFetch).not.toHaveBeenCalled();
    expect(mocks.apiKeyAccountsFetch).not.toHaveBeenCalled();
  });
});
