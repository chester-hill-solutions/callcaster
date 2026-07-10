import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    safeParseJson: vi.fn(),
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    callFindFirst: vi.fn(async () => null),
    callInsert: vi.fn(async () => []),
    callUpdate: vi.fn(async () => []),
  };
});

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      findFirst: (...args: unknown[]) => mocks.callFindFirst(...args),
      insert: (...args: unknown[]) => mocks.callInsert(...args),
      update: (...args: unknown[]) => mocks.callUpdate(...args),
    },
    execute: vi.fn(async () => []),
  })),
}));

vi.mock("@client/client-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));

vi.mock("../app/lib/env.server", () => ({ env: mocks.env }));
vi.mock("../app/lib/logger.server", () => ({ logger: mocks.logger }));

const testState = vi.hoisted(() => ({ client: null as any }));

const claimNextQueueContactMock = vi.hoisted(() => vi.fn());
const requeueCampaignQueueByIdMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  claimNextQueueContact: (...args: unknown[]) => claimNextQueueContactMock(...args),
  requeueCampaignQueueById: (...args: unknown[]) => requeueCampaignQueueByIdMock(...args),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: async (_db: any) => {
    const client = testState.client;
    const result = await client.rpc("create_outreach_attempt");
    if (result?.error) throw result.error;
    const id = result?.data ?? null;
    if (id == null) throw new Error("create_outreach_attempt returned no id");
    return id;
  },
  rpcDequeueContact: async (_db: any) => {
    const client = testState.client;
    const result = await client.rpc("dequeue_contact");
    if (result?.error) throw result.error;
  },
}));

function makeDbClient() {
  const channel = vi.fn(() => ({ send: vi.fn() }));
  const removeChannel = vi.fn();

  const rpc = vi.fn();
  const from = vi.fn();

  return { channel, removeChannel, rpc, from };
}

describe("app/routes/api+/auto-dial/dialer.route.tsx", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.callFindFirst.mockReset();
    mocks.callInsert.mockReset();
    mocks.callUpdate.mockReset();
    mocks.callFindFirst.mockResolvedValue(null);
    mocks.callInsert.mockResolvedValue([]);
    mocks.callUpdate.mockResolvedValue([]);
    claimNextQueueContactMock.mockReset();
    requeueCampaignQueueByIdMock.mockReset();
    requeueCampaignQueueByIdMock.mockResolvedValue([]);
    vi.resetModules();
  });

  test("happy path: gets contact, creates attempt + twilio call, dequeues, saves call, returns success", async () => {
    const client = makeDbClient();
    testState.client = client;

    claimNextQueueContactMock.mockResolvedValueOnce({
      queue_id: 1,
      contact_id: 2,
      contact_phone: "(555) 555-0100",
      caller_id: "+15551234567",
    });

    client.rpc.mockImplementation(async (fn: string) => {
      if (fn === "create_outreach_attempt") return { data: 99, error: null };
      if (fn === "dequeue_contact") return { data: {}, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });

    client.from.mockImplementation((table: string) => {
      throw new Error(`unexpected table ${table}`);
    });

    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
      conference_id: "conf-session",
    });

    const twilioCallsCreate = vi.fn(async () => ({
      sid: "CA1",
      from: "+15551234567",
      status: "queued",
      dateUpdated: new Date(0),
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: twilioCallsCreate },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/dialer", { method: "POST" }),
    } as any));

    expect(res.status).toEqual(expect.any(Number));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(twilioCallsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://base.example/api/auto-dial/conf-session",
      }),
    );
    expect(mocks.callInsert).toHaveBeenCalled();
    expect(claimNextQueueContactMock).toHaveBeenCalledWith(expect.anything(), 1, "u1");
  });

  test("saves call: logs and continues when sid is missing", async () => {
    const client = makeDbClient();
    testState.client = client;
    claimNextQueueContactMock.mockResolvedValueOnce({
      queue_id: 1,
      contact_id: 2,
      contact_phone: "5555550100",
      caller_id: "+1555",
    });
    client.rpc.mockImplementation(async (fn: string) => {
      if (fn === "create_outreach_attempt") return { data: 1, error: null };
      if (fn === "dequeue_contact") return { data: {}, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });
    client.from.mockImplementation(() => {
      throw new Error("unexpected client.from during saveCallToDatabase sid-missing test");
    });
    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => ({ sid: undefined }) },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any));
    await res.json();
    expect(mocks.logger.error).toHaveBeenCalledWith("Cannot save call without sid");
  });

  test("no queued contacts: completes conferences and returns message", async () => {
    const client = makeDbClient();
    testState.client = client;
    claimNextQueueContactMock.mockResolvedValueOnce(null);
    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
      conference_id: "conf-session",
    });

    const confUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      conferences: Object.assign(
        (_sid: string) => ({ update: confUpdate }),
        { list: vi.fn(async () => [{ sid: "CONF1" }, { sid: "CONF2" }]) },
      ),
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true, message: "No queued contacts" });
    expect(confUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.createWorkspaceTwilioInstance.mock.calls[0][0]).toEqual({ workspace_id: "w1" });
  });

  test("returns 500-style JSON response when dequeue_contact rpc errors", async () => {
    const client = makeDbClient();
    testState.client = client;

    claimNextQueueContactMock.mockResolvedValueOnce({
      queue_id: 1,
      contact_id: 2,
      contact_phone: "5555550100",
      caller_id: "+1555",
    });
    client.rpc.mockImplementation(async (fn: string) => {
      if (fn === "create_outreach_attempt") return { data: 1, error: null };
      if (fn === "dequeue_contact") return { data: null, error: new Error("dq") };
      throw new Error(`unexpected rpc ${fn}`);
    });
    client.from.mockImplementation((table: string) => {
      if (table === "call") return { upsert: () => ({ select: async () => ({ error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => ({ sid: "CA1", from: "+1555" }) },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({ success: false, error: "dq" });
  });

  test("error formatting: non-Error thrown becomes Unknown error", async () => {
    const client = makeDbClient();
    testState.client = client;
    claimNextQueueContactMock.mockRejectedValueOnce("nope");
    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ conferences: { list: async () => [] } });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Unknown error" });
  });

  test("normalizePhoneNumber throws invalid length (covered by catch)", async () => {
    const client = makeDbClient();
    testState.client = client;
    claimNextQueueContactMock.mockResolvedValueOnce({
      queue_id: 1,
      contact_id: 2,
      contact_phone: "+123",
      caller_id: "+1555",
    });
    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ conferences: { list: async () => [] } });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid phone number length" });
  });

  test("helper exports cover remaining branches (normalization, claim throws, and call persistence shaping)", async () => {
    const helpers = await import("../app/routes/api+/auto-dial/dialer.action.server");

    // normalizePhoneNumber: + in middle triggers plus removal and minLength else-path
    expect(helpers.normalizePhoneNumber("1+5555550100")).toBe("+15555550100");

    // getNextContact: throws when claim returns error
    claimNextQueueContactMock.mockRejectedValueOnce(new Error("q"));
    await expect(helpers.getNextContact(1, "u1")).rejects.toThrow("q");

    // createOutreachAttempt: throws when rpc returns error
    testState.client = {
      rpc: vi.fn(async (fn: string) => {
        if (fn === "create_outreach_attempt") return { data: null, error: new Error("oa") };
        return { data: null, error: null };
      }),
    };
    await expect(
      helpers.createOutreachAttempt(
        { queue_id: 1, contact_id: 2, contact_phone: "+15555550100" },
        1,
        "w1",
        "u1",
      ),
    ).rejects.toThrow("oa");

    // saveCallToDatabase: shapes optional fields and logs on persistence error
    await helpers.saveCallToDatabase(
      "w1",
      {
        sid: "CA1",
        to: "",
        from: "",
        status: "",
        start_time: "2020-01-01T00:00:00.000Z",
        end_time: "2020-01-01T00:00:00.000Z",
        duration: 5 as any,
        price: 0.5 as any,
        campaign_id: 0 as any,
        contact_id: 0 as any,
        outreach_attempt_id: 0 as any,
        conference_id: "",
      },
      {
        tdb: {
          call: {
            findFirst: vi.fn(async () => null),
            insert: vi.fn(async () => {
              throw new Error("ins");
            }),
            update: vi.fn(),
          },
        } as any,
      },
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.any(Error),
    );
  });

  test("concurrency: only one of two simultaneous requests dials a contact", async () => {
    const client = makeDbClient();
    testState.client = client;

    let claimCount = 0;
    claimNextQueueContactMock.mockImplementation(async () => {
      claimCount += 1;
      // Only the first concurrent claim succeeds.
      if (claimCount === 1) {
        return {
          queue_id: 1,
          contact_id: 2,
          contact_phone: "+15555550100",
          caller_id: "+15551234567",
        };
      }
      return null;
    });

    client.rpc.mockImplementation(async (fn: string) => {
      if (fn === "create_outreach_attempt") return { data: 1, error: null };
      if (fn === "dequeue_contact") return { data: {}, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });
    mocks.createClient.mockReturnValue(client);

    const twilioCallsCreate = vi.fn(async () => ({
      sid: "CA1",
      from: "+15551234567",
      status: "queued",
      dateUpdated: new Date(0),
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      calls: { create: twilioCallsCreate },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    mocks.safeParseJson.mockResolvedValue({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
      conference_id: "conf-session",
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const [res1, res2] = await Promise.all([
      asRouteResponse(await mod.action({
        request: new Request("http://localhost/api/auto-dial/dialer", { method: "POST" }),
      } as any)),
      asRouteResponse(await mod.action({
        request: new Request("http://localhost/api/auto-dial/dialer", { method: "POST" }),
      } as any)),
    ]);

    await expect(res1.json()).resolves.toEqual({ success: true });
    await expect(res2.json()).resolves.toEqual({ success: true, message: "No queued contacts" });
    expect(twilioCallsCreate).toHaveBeenCalledTimes(1);
    expect(claimNextQueueContactMock).toHaveBeenCalledTimes(2);
  });

  test("queue wedge fix: releases the claimed contact back to queued when the Twilio call fails", async () => {
    const client = makeDbClient();
    testState.client = client;

    claimNextQueueContactMock.mockResolvedValueOnce({
      queue_id: 7,
      contact_id: 2,
      contact_phone: "+15555550100",
      caller_id: "+15551234567",
    });

    client.rpc.mockImplementation(async (fn: string) => {
      if (fn === "create_outreach_attempt") return { data: 99, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });

    mocks.createClient.mockReturnValueOnce(client);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
      conference_id: "conf-session",
    });

    const twilioCallsCreate = vi.fn(async () => {
      throw new Error("Twilio API unavailable");
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: twilioCallsCreate },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/routes/api+/auto-dial/dialer.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/auto-dial/dialer", { method: "POST" }),
    } as any));

    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Twilio API unavailable",
    });
    // Regression guard: the claimed campaign_queue row must be released back
    // to `queued` when the Twilio call never gets placed — otherwise the
    // contact is stuck "assigned" forever and the predictive dialer's queue
    // wedges. See app/lib/campaign-queue-db.server.ts:requeueCampaignQueueById.
    expect(requeueCampaignQueueByIdMock).toHaveBeenCalledWith(7, "w1");
  });
});

