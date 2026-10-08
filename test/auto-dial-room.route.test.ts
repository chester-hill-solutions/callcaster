import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { configureTelephonyStub, telephonyDbMocks } from "./helpers/telephony-db-stub";

const roomCallRow = vi.hoisted(() => ({
  current: {
    campaign_id: 1,
    outreach_attempt_id: 1,
    contact_id: 1,
    workspace: "w1",
    conference_id: "u1~00000000-0000-0000-0000-000000000000",
  } as Record<string, unknown>,
}));

const roomClientState = vi.hoisted(() => ({ client: null as any }));

vi.mock("@/lib/auth.server", () => ({
  getAdminDb: () => roomClientState.client,
}));

function setRoomCallRow(row: Record<string, unknown>) {
  roomCallRow.current = row;
  configureTelephonyStub({ callRow: row });
}

function useRoomPostgres(client: ReturnType<typeof makeDbClient>) {
  roomClientState.client = client;
  mocks.createClient.mockReturnValueOnce(client);
  return client;
}

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    fetch: vi.fn(async () => ({ ok: true })),
    fetchCampaignByIdForWorkspace: vi.fn(async () => ({
      voicemail_drop_enabled: true,
      voicemail_file: "vm.mp3",
      group_household_queue: true,
      caller_id: "+1555",
    })),
  };
});

vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignByIdForWorkspace: (...args: unknown[]) =>
    mocks.fetchCampaignByIdForWorkspace(...args),
}));

vi.mock("@client/client-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

vi.mock("../app/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));

vi.mock("../app/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
    BASE_URL: () => "https://base.example",
  },
}));

vi.mock("../app/lib/logger.server", () => ({ logger: mocks.logger }));

const runAutoDialerTurnMock = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("@/lib/auto-dial.server", () => ({
  runAutoDialerTurn: (...args: unknown[]) => runAutoDialerTurnMock(...args),
}));

const predictiveResponseMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/predictive-machine.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/predictive-machine.server")>()),
  predictiveMachineResponse: predictiveResponseMock,
}));

const roomRpcState = vi.hoisted(() => ({ client: null as any }));
const roomStorageState = vi.hoisted(() => ({ error: null as Error | null }));
const createSignedObjectUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/object-storage.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/object-storage.server")>(
    "@/lib/object-storage.server",
  );
  return {
    ...actual,
    createSignedObjectUrl: (...args: unknown[]) => createSignedObjectUrlMock(...args),
  };
});

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: vi.fn(async (args: {
    params?: Record<string, string>;
  }) => (null)),
}));

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: vi.fn(() => true),
}));

// addToConference reads the workspace to decide whether to attach a live
// transcription <Stream>. Unmocked it reaches a real database and throws
// before the dialer turn runs.
vi.mock("@/lib/workspace-members-db.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspace-members-db.server")
  >("@/lib/workspace-members-db.server");
  return {
    ...actual,
    getWorkspaceById: vi.fn(async () => ({ feature_flags: {} })),
  };
});

const roomDbMocks = vi.hoisted(() => ({
  dequeueCampaignQueueByContact: vi.fn(async () => [{ ok: 1 }]),
  getUserVerifiedAudioNumbers: vi.fn(async () => ["+1666"] as string[] | null),
}));

// dequeueQueueEntry (app/lib/campaign-queue-db.server.ts) is the single
// entry point $roomId.action.server.ts's local dequeueContact helper now
// calls for both branches (issue #1240 B3) — route it here the same way the
// real function does: household => the simulated dequeue_contact RPC via
// the fake postgrest client already wired up per-test through
// roomRpcState.client; no household => the plain-Drizzle mock below.
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: async (args: { household?: boolean }) => {
    if (args.household) {
      const client = roomRpcState.client;
      const result = await client.rpc("dequeue_contact");
      if (result?.error) throw result.error;
      return;
    }
    return roomDbMocks.dequeueCampaignQueueByContact(args);
  },
}));

vi.mock("@/lib/user-audio.server", () => ({
  getUserVerifiedAudioNumbers: (...args: unknown[]) =>
    roomDbMocks.getUserVerifiedAudioNumbers(...args),
}));

vi.mock("@/lib/telephony-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telephony-db.server")>();
  const stub = await import("./helpers/telephony-db-stub");
  return {
    ...actual,
    claimTerminalOutreachDisposition: stub.telephonyDbMocks.claimTerminalOutreachDisposition,
    findCallBySid: stub.telephonyDbMocks.findCallBySid,
    findCallsByConferenceId: stub.telephonyDbMocks.findCallsByConferenceId,
    findActiveConferenceIdsForUser: stub.telephonyDbMocks.findActiveConferenceIdsForUser,
    updateCallBySid: stub.telephonyDbMocks.updateCallBySid,
    findOutreachAttemptById: stub.telephonyDbMocks.findOutreachAttemptById,
    updateOutreachAttemptForWorkspace: stub.telephonyDbMocks.updateOutreachAttemptForWorkspace,
    insertCallForWorkspace: stub.telephonyDbMocks.insertCallForWorkspace,
  };
});

function makeDbClient(overrides: Partial<any>) {
  const client: any = {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    realtime: { channel: vi.fn(() => ({ send: vi.fn() })) },
    removeChannel: vi.fn(),
    ...overrides,
  };
  return client;
}

describe("app/routes/api+/auto-dial/route.$roomId.tsx", () => {
  beforeEach(() => {
    configureTelephonyStub();
    predictiveResponseMock.mockReset();
    predictiveResponseMock.mockResolvedValue(new Response("<Response><Hangup/></Response>", {headers:{"Content-Type":"text/xml"}}));
    roomDbMocks.dequeueCampaignQueueByContact.mockReset();
    roomDbMocks.dequeueCampaignQueueByContact.mockResolvedValue([{ ok: 1 }]);
    roomDbMocks.getUserVerifiedAudioNumbers.mockReset();
    roomDbMocks.getUserVerifiedAudioNumbers.mockResolvedValue(["+1666"]);
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockClear();
    mocks.fetchCampaignByIdForWorkspace.mockReset();
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({
      voicemail_drop_enabled: true,
      voicemail_file: "vm.mp3",
      group_household_queue: true,
      caller_id: "+1555",
    });
    setRoomCallRow({
      campaign_id: 1,
      outreach_attempt_id: 1,
      contact_id: 1,
      workspace: "w1",
      conference_id: "u1~00000000-0000-0000-0000-000000000000",
    });
    roomStorageState.error = null;
    createSignedObjectUrlMock.mockImplementation(async () => {
      if (roomStorageState.error) throw roomStorageState.error;
      return "https://signed";
    });
    vi.stubGlobal("fetch", mocks.fetch);
    runAutoDialerTurnMock.mockClear();
    runAutoDialerTurnMock.mockResolvedValue({ success: true });
    telephonyDbMocks.claimTerminalOutreachDisposition.mockClear();
  });

  test("device-check path: verified device joins conference and triggers dialer", async () => {
    const client = makeDbClient({});
    roomRpcState.client = client;

    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  campaign_id: 1,
                  outreach_attempt_id: 1,
                  contact_id: 1,
                  workspace: "w1",
                  conference_id: "u1~00000000-0000-0000-0000-000000000000",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { verified_audio_numbers: ["+1555"] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { sid: "ACtest", authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "client:u1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    // Regression guard: the dialer turn must be invoked in-process, not via
    // a self-fetch to /api/auto-dial/dialer (that path is matched by the
    // Twilio webhook prefix and an unsigned self-fetch would 403 in
    // production). See app/lib/auto-dial.server.ts:runAutoDialerTurn.
    expect(mocks.fetch).not.toHaveBeenCalledWith(
      "https://base.example/api/auto-dial/dialer",
      expect.anything(),
    );
    expect(runAutoDialerTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        campaign_id: "1",
        workspace_id: "w1",
        conference_id: "u1~00000000-0000-0000-0000-000000000000",
      }),
    );
  });

  test("user device lookup error is caught", async () => {
    roomDbMocks.getUserVerifiedAudioNumbers.mockRejectedValueOnce(new Error("user"));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("covers Called fallback (missing Called field)", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ ok: 1 }], error: null }) }) }) };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    // intentionally omit Called
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("human answer: returns conference dial twiml and updates answered_at when called is not client", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const outreachSelect = vi.fn(async () => ({ data: [{ ok: 1 }], error: null }));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: null }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: outreachSelect,
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { sid: "ACtest", authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalled();
  });

  test("human answer: conference dial carries a statusCallback so a contact hangup is detected", async () => {
    // Regression (#1282 follow-up): only the agent's conference leg had a
    // statusCallback wired (addToConference). The contact's own
    // <Dial><Conference> had none, so Twilio never posted a
    // participant-leave event when the CLIENT hung up — the app had no
    // server-driven signal and depended entirely on Twilio's platform-level
    // endConferenceOnExit reaching the agent's browser.
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const outreachSelect = vi.fn(async () => ({ data: [{ ok: 1 }], error: null }));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: null }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: outreachSelect }) }) };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { sid: "ACtest", authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));

    const body = await res.text();
    expect(body).toContain('statusCallback="https://base.example/api/auto-dial/status"');
    expect(body).toContain('statusCallbackEvent="join leave modify"');
  });

  test("device-check: called equals campaign caller_id", async () => {
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1888" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1999"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("device-check: no contactId but verified_audio_numbers includes called", async () => {
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: null, outreach_attempt_id: null, contact_id: null, workspace: null, conference_id: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1777"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1777");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("human answer: called starts with client skips answered_at update", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const outreachSelect = vi.fn(async () => ({ data: [{ ok: 1 }], error: null }));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1~00000000-0000-0000-0000-000000000000" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: null }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: outreachSelect }) }) };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "client:u1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/u1~00000000-0000-0000-0000-000000000000", { method: "POST", body: fd }),
      params: { roomId: "u1~00000000-0000-0000-0000-000000000000" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    // Only called from machine paths / answered-at branch; should not be invoked here.
    expect(outreachSelect).not.toHaveBeenCalledWith(expect.anything());
  });
  async function machineRequest(query = "", answeredBy = "machine_start") {
    const mod = await import("@/routes/api+/auto-dial/$roomId.route");
    const request = new Request("http://localhost/api/auto-dial/room-authority" + query, {
      method: "POST", body: new URLSearchParams({CallSid:"CA1",AnsweredBy:answeredBy,CallStatus:"in-progress",Called:"+15551230001"}),
    });
    return asRouteResponse(mod.action({request,params:{roomId:"room-authority"},context:{}} as Parameters<typeof mod.action>[0]));
  }
  test("machine answer delegates the call and URL binding without an immediate next turn", async () => {
    const response=await machineRequest();
    expect(response.status).toBe(200);
    expect(predictiveResponseMock).toHaveBeenCalledWith({workspaceId:"w1",callSid:"CA1",conferenceId:"room-authority"});
    expect(runAutoDialerTurnMock).not.toHaveBeenCalled();
    expect(telephonyDbMocks.claimTerminalOutreachDisposition).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
  });
  test.each(["complete","wait"])("%s callback forwards its phase and operation before device checks", async phase => {
    const response=await machineRequest("?machine="+phase+"&operation=bound-operation", "human");
    expect(response.status).toBe(200);
    expect(predictiveResponseMock).toHaveBeenCalledWith({workspaceId:"w1",callSid:"CA1",conferenceId:"room-authority"},phase,"bound-operation");
    expect(roomDbMocks.getUserVerifiedAudioNumbers).not.toHaveBeenCalled();
    expect(mocks.fetchCampaignByIdForWorkspace).not.toHaveBeenCalled();
    expect(runAutoDialerTurnMock).not.toHaveBeenCalled();
  });
  test("machine service response is returned unchanged", async () => {
    const serviceResponse=new Response("<Response><Pause length=\"1\"/><Redirect>https://fixture.example/wait</Redirect></Response>",{headers:{"Content-Type":"text/xml"}});
    predictiveResponseMock.mockResolvedValueOnce(serviceResponse);
    const response=await machineRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(await response.text()).toBe("<Response><Pause length=\"1\"/><Redirect>https://fixture.example/wait</Redirect></Response>");
  });
  test("a failed machine operation returns retryable 500 Hangup", async () => {
    predictiveResponseMock.mockRejectedValueOnce(new Error("Fixture operation failure"));
    const response=await machineRequest();
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("<Hangup/>");
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(runAutoDialerTurnMock).not.toHaveBeenCalled();
  });
  test("a missing call cannot invoke the machine service", async () => {
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(null);
    expect((await machineRequest()).status).toBe(500);
    expect(predictiveResponseMock).not.toHaveBeenCalled();
    expect(runAutoDialerTurnMock).not.toHaveBeenCalled();
  });

});
