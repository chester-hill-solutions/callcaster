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
  listVerifications: vi.fn(),
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

vi.mock("twilio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("twilio")>()),
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
        messaging: { v1: { tollfreeVerifications: { list: (...args: unknown[]) => mocks.listVerifications(...args) } } },
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

vi.mock("@/lib/twilio-sender-pool.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-sender-pool.server")>()),
  verifyWorkspaceMessagingSenderPool: async () => ({
    serviceSid: "MG123", inSync: true, missingFromPool: [], livePhoneNumbers: ["+18885551212"],
  }),
}));

function readyWorkspace(portalSync?: unknown) {
  return {
    sid: "AC123", authToken: "fixture-token", portalSync,
    onboarding: {
      status: "live", operatingCountry: "CA", selectedChannels: [],
      messagingService: { serviceSid: "MG123", desiredSendMode: "from_number" },
    },
  };
}
function tollFreeInventory() {
  return [{ sid: "PN_toll_free", phoneNumber: "+18885551212", capabilities: { sms: true, mms: false, voice: true } }];
}
async function sendGate() {
  const { assertWorkspaceCanSendSms } = await import("@/lib/twilio-readiness.server");
  return assertWorkspaceCanSendSms({ workspaceId: "w1" });
}

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
    mocks.listVerifications.mockReset();
    mocks.listVerifications.mockResolvedValue([]);
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
  test.each([
    { status: undefined, records: [] },
    { status: "APPROVED", records: [{ tollfreePhoneNumberSid: "PN_toll_free", status: "APPROVED" }] },
    { status: "unknown", records: [{ tollfreePhoneNumberSid: "PN_toll_free", status: "unknown" }] },
    { status: "PENDING_REVIEW", records: [{ tollfreePhoneNumberSid: "PN_toll_free", status: "PENDING_REVIEW" }] },
    { status: "TWILIO_REJECTED", records: [{ tollfreePhoneNumberSid: "PN_toll_free", status: "TWILIO_REJECTED" }] },
  ])("stored $status verification blocks the real send gate", async ({ records }) => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockResolvedValue(tollFreeInventory());
    mocks.listVerifications.mockResolvedValue(records);
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.tollFreeVerificationBlocked).toBe(true);
    await expect(sendGate()).rejects.toThrow(/verification/i);
  });

  test("approved verification writes complete proof and permits the real send gate", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockResolvedValue(tollFreeInventory());
    mocks.listVerifications.mockResolvedValue([{ tollfreePhoneNumberSid: "PN_toll_free", status: "TWILIO_APPROVED" }]);
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.tollFreeVerificationBlocked).toBe(false);
    expect(snapshot).toMatchObject({ tollFreeVerificationCheckedAt: snapshot.lastSyncedAt });
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
    await expect(sendGate()).resolves.toBeUndefined();
  });

  test("a verification provider error is persisted and reaches the real send gate", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockResolvedValue(tollFreeInventory());
    mocks.listVerifications.mockRejectedValue(new Error("Verification provider unavailable"));
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.lastSyncStatus).toBe("error");
    expect(snapshot.lastSyncError).toBe("Verification provider unavailable");
    expect(snapshot.tollFreeVerificationBlocked).toBe(true);
    await expect(sendGate()).rejects.toThrow("Verification provider unavailable");
  });

  test("failed inventory cannot establish approval", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockRejectedValue(new Error("Inventory unavailable"));
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.tollFreeVerificationBlocked).toBe(true);
    await expect(sendGate()).rejects.toThrow("Inventory unavailable");
  });

  test("successful inventory with no toll-free sender permits sends without a verification call", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockResolvedValue([{ sid: "PN_local", phoneNumber: "+14165551212", capabilities: { sms: true, mms: false, voice: true } }]);
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.tollFreeVerificationBlocked).toBe(false);
    expect(snapshot).toMatchObject({ tollFreeVerificationCheckedAt: snapshot.lastSyncedAt });
    expect(mocks.listVerifications).not.toHaveBeenCalled();
    await expect(sendGate()).resolves.toBeUndefined();
  });

  test.each([
    { name: "absent", snapshot: undefined },
    { name: "legacy healthy false flag", snapshot: { lastSyncStatus: "healthy", tollFreeVerificationBlocked: false } },
    { name: "malformed proof", snapshot: { lastSyncStatus: "healthy", tollFreeVerificationBlocked: false, tollFreeVerificationCheckedAt: "not-a-date" } },
    { name: "missing verdict", snapshot: { lastSyncStatus: "healthy", tollFreeVerificationCheckedAt: "2026-10-03T10:00:00Z" } },
    { name: "failed false flag", snapshot: { lastSyncStatus: "error", tollFreeVerificationBlocked: false, tollFreeVerificationCheckedAt: "2026-10-03T10:00:00Z" } },
  ])("$name evidence cannot permit the real send gate", async ({ snapshot }) => {
    setWorkspace({ twilioData: readyWorkspace(snapshot) });
    await expect(sendGate()).rejects.toThrow(/verification/i);
  });

  test("successful approved refresh replaces failure and restores the send gate", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    mocks.listNumbers.mockResolvedValue(tollFreeInventory());
    mocks.listVerifications.mockRejectedValueOnce(new Error("Verification provider unavailable"));
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    await expect(sendGate()).rejects.toThrow(/verification/i);
    mocks.listVerifications.mockResolvedValue([{ tollfreePhoneNumberSid: "PN_toll_free", status: "TWILIO_APPROVED" }]);
    const refreshed = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(refreshed.lastSyncError).toBeNull();
    expect(refreshed.tollFreeVerificationBlocked).toBe(false);
    await expect(sendGate()).resolves.toBeUndefined();
  });

  test("a toll-free sender beyond 200 inventory records still blocks the real send gate", async () => {
    setWorkspace({ twilioData: readyWorkspace() });
    mocks.accountLevelFetch.mockResolvedValue({ status: "active", friendlyName: "Workspace" });
    const { Twilio } = await vi.importActual<typeof import("twilio")>("twilio");
    const { default: RequestClient } = await import("twilio/lib/base/RequestClient");
    const transport = new RequestClient();
    const request = vi.spyOn(transport, "request").mockImplementation(async (args) => {
      const tail = args.uri.includes("PageToken=tail");
      return { statusCode: 200, headers: {}, body: JSON.stringify({
        incoming_phone_numbers: tail
          ? [{ sid: "PN_toll_free", phone_number: "+18885551212", capabilities: { sms: true, mms: false, voice: true } }]
          : Array.from({ length: 200 }, (_, i) => ({ sid: `PN_local_${i}`, phone_number: "+14165551212", capabilities: { sms: true, mms: false, voice: true } })),
        next_page_uri: tail ? null : "/2010-04-01/Accounts/AC11111111111111111111111111111111/IncomingPhoneNumbers.json?PageToken=tail",
        previous_page_uri: null,
      }) };
    });
    const sdk = new Twilio(`AC${"1".repeat(32)}`, "fixture-token", { httpClient: transport });
    mocks.listNumbers.mockImplementation((options: { limit?: number; pageSize?: number }) => sdk.incomingPhoneNumbers.list(options));
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(snapshot.phoneNumberCount).toBe(201);
    expect(snapshot.tollFreeVerificationBlocked).toBe(true);
    await expect(sendGate()).rejects.toThrow(/verification/i);
  });

  test("missing credentials block the real send gate before provider reads", async () => {
    setWorkspace({ twilioData: { ...readyWorkspace(), sid: null, authToken: null } });
    const { syncWorkspaceTwilioSnapshot } = await import("@/lib/database/workspace-twilio-sync.server");
    const snapshot = await syncWorkspaceTwilioSnapshot({ workspaceId: "w1" });
    expect(snapshot.tollFreeVerificationBlocked).toBe(true);
    expect(mocks.accountLevelFetch).not.toHaveBeenCalled();
    expect(mocks.listVerifications).not.toHaveBeenCalled();
    await expect(sendGate()).rejects.toThrow("Missing workspace Twilio credentials");
  });

  test.each([
    { name: "absent", snapshot: undefined, blocked: true },
    { name: "missing verdict", snapshot: {}, blocked: true },
    { name: "blocked", snapshot: { tollFreeVerificationBlocked: true }, blocked: true },
    { name: "explicit allowed", snapshot: { tollFreeVerificationBlocked: false }, blocked: false },
  ])("shared predicate $name evidence has blocked=$blocked", async ({ snapshot, blocked }) => {
    const { evaluateWorkspaceReadinessByIds, getWorkspaceMessagingOnboardingFromTwilioData } = await import("@/lib/messaging-onboarding.server");
    const results = evaluateWorkspaceReadinessByIds({
      onboarding: getWorkspaceMessagingOnboardingFromTwilioData(readyWorkspace()),
      workspaceNumbers: [], syncSnapshot: snapshot,
    }, ["toll_free_verified"]);
    expect(results.length).toBe(blocked ? 1 : 0);
    if (blocked) expect(results[0].message).toMatch(/verification.*missing.*unconfirmed/i);
  });

});
