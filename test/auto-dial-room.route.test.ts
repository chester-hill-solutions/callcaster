import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { configureTelephonyStub, telephonyDbMocks } from "./helpers/telephony-db-stub";

const roomCallRow = vi.hoisted(() => ({
  current: {
    campaign_id: 1,
    outreach_attempt_id: 1,
    contact_id: 1,
    workspace: "w1",
    conference_id: "u1",
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

vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
}));

vi.mock("../app/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
    BASE_URL: () => "https://base.example",
  },
}));

vi.mock("../app/lib/logger.server", () => ({ logger: mocks.logger }));

const roomRpcState = vi.hoisted(() => ({ client: null as any }));
const roomStorageState = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: async (_db: any) => {
    const client = roomRpcState.client;
    const result = await client.rpc("dequeue_contact");
    if (result?.error) throw result.error;
  },
}));

vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: async () => {
    if (roomStorageState.error) throw roomStorageState.error;
    return "https://signed";
  },
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForCallSid: vi.fn(async (args: {
    params?: Record<string, string>;
  }) => ({
    ok: true,
    params: args.params ?? {},
    authToken: "tok",
  })),
}));

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: vi.fn(() => true),
}));

vi.mock("@/lib/twilio-twiml.server", () => ({
  hangupTwiml: () => '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
  pausePlayTwiml: (url: string, seconds = 5) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="${seconds}"/><Play>${url}</Play></Response>`,
}));

const roomDbMocks = vi.hoisted(() => ({
  dequeueCampaignQueueByContact: vi.fn(async () => [{ ok: 1 }]),
  getUserVerifiedAudioNumbers: vi.fn(async () => ["+1666"] as string[] | null),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueCampaignQueueByContact: (...args: unknown[]) =>
    roomDbMocks.dequeueCampaignQueueByContact(...args),
}));

vi.mock("@/lib/user-audio.server", () => ({
  getUserVerifiedAudioNumbers: (...args: unknown[]) =>
    roomDbMocks.getUserVerifiedAudioNumbers(...args),
}));

vi.mock("@/lib/telephony-db.server", async () => {
  const stub = await import("./helpers/telephony-db-stub");
  return {
    findCallBySid: stub.telephonyDbMocks.findCallBySid,
    findCallsByConferenceId: stub.telephonyDbMocks.findCallsByConferenceId,
    updateCallBySid: stub.telephonyDbMocks.updateCallBySid,
    findOutreachAttemptById: stub.telephonyDbMocks.findOutreachAttemptById,
    updateOutreachAttemptForWorkspace: stub.telephonyDbMocks.updateOutreachAttemptForWorkspace,
    insertCallForWorkspace: stub.telephonyDbMocks.insertCallForWorkspace,
  };
});

vi.mock("twilio", () => {
  class VoiceResponse {
    private _dialed: any[] = [];
    dial() {
      return {
        conference: (_opts: any, name: string) => {
          this._dialed.push(name);
        },
      };
    }
    toString() {
      return "<Response/>";
    }
  }

  return {
    default: {
      twiml: { VoiceResponse },
    },
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
      voicemail_file: "vm.mp3",
      group_household_queue: true,
      caller_id: "+1555",
    });
    setRoomCallRow({
      campaign_id: 1,
      outreach_attempt_id: 1,
      contact_id: 1,
      workspace: "w1",
      conference_id: "u1",
    });
    roomStorageState.error = null;
    vi.stubGlobal("fetch", mocks.fetch);
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
                  conference_id: "u1",
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://base.example/api/auto-dial/dialer",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("machine answer: plays voicemail, dequeues (rpc), triggers next dial, and updates call twiml", async () => {
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => [{ sid: "CONF1" }]) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

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
                  contact_id: 2,
                  workspace: "w1",
                  conference_id: "u1",
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
              single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({
                data: [{ user_id: "u1", campaign_id: 1 }],
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

    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    client.rpc.mockResolvedValueOnce({ data: {}, error: null }); // dequeue_contact

    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(updateCallTwiml).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Play>https://signed</Play>") }),
    );
    expect(mocks.fetch).toHaveBeenCalled();
  });

  test("machine answer with no voicemail signedUrl returns Hangup response", async () => {
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({
      voicemail_file: null,
      group_household_queue: true,
      caller_id: "+1555",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" },
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
                data: { voicemail_file: null, group_household_queue: true, caller_id: "+1555" },
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
              single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
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
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));

    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: conferences empty + fallbacks + campaign_queue dequeue success", async () => {
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({
      voicemail_file: "vm.mp3",
      group_household_queue: null,
      caller_id: null,
    });
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => []) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

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
                  contact_id: 2,
                  workspace: "w1",
                  conference_id: "u1",
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
                data: { voicemail_file: "vm.mp3", group_household_queue: null, caller_id: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({
                data: [{}], // user_id/campaign_id undefined => cover fallbacks
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({ data: [{ ok: 1 }], error: null }),
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
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(updateCallTwiml).toHaveBeenCalled();
  });

  test("machine answer: dequeue_contact rpc error is caught", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    client.rpc.mockResolvedValueOnce({ data: null, error: new Error("dq") });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: outreach_attempt update error is caught", async () => {
    configureTelephonyStub({ outreachUpdateError: new Error("oa") });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: null, error: new Error("oa") }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("user device lookup error is caught", async () => {
    roomDbMocks.getUserVerifiedAudioNumbers.mockRejectedValueOnce(new Error("user"));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
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
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("covers triggerAutoDialer fallbacks when outreachStatus/user/workspace are missing", async () => {
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => [{ sid: "CONF1" }]) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }) };
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
      throw new Error(`unexpected ${table}`);
    });
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    client.rpc.mockResolvedValueOnce({ data: {}, error: null }); // dequeue_contact
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://base.example/api/auto-dial/dialer",
      expect.objectContaining({ method: "POST" }),
    );
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
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" },
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalled();
  });

  test("errors are caught and return Hangup response", async () => {
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("call") }) }) }) };
      }
      throw new Error("unexpected");
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(await res.text()).toContain("<Hangup/>");
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
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1" },
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("machine answer: campaign fetch error is caught", async () => {
    mocks.fetchCampaignByIdForWorkspace.mockRejectedValueOnce(new Error("camp"));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("camp") }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: voicemail storage error is caught", async () => {
    roomStorageState.error = new Error("storage");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: null, error: new Error("storage") }),
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: group_household_queue=false uses campaign_queue update and handles its error", async () => {
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({
      voicemail_file: "vm.mp3",
      group_household_queue: false,
      caller_id: "+1555",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    roomDbMocks.dequeueCampaignQueueByContact.mockRejectedValueOnce(new Error("q"));
    const client = makeDbClient({});
    roomRpcState.client = client;
    client.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    client.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    useRoomPostgres(client);

    const mod = await import("../app/routes/api+/auto-dial/$roomId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(await res.text()).toContain("<Hangup/>");
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
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
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
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    // Only called from machine paths / answered-at branch; should not be invoked here.
    expect(outreachSelect).not.toHaveBeenCalledWith(expect.anything());
  });
});

