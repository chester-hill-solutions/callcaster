import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createWorkspaceTwilioInstance: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    requireTwilioSignature: vi.fn(),
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "test",
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

const telephonyDbMocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(),
  upsertCallBySid: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
}));

const rpcMocks = vi.hoisted(() => ({
  rpcTryCompleteCampaignIfDrained: vi.fn(),
}));

const tenantDbMocks = vi.hoisted(() => ({
  createTenantDb: vi.fn(),
}));

const campaignIvrMocks = vi.hoisted(() => ({
  fetchCampaignWithScript: vi.fn(),
  resolveCampaignScript: vi.fn((campaign: any) => campaign?.script ?? null),
}));

const objectStorageMocks = vi.hoisted(() => ({
  createSignedObjectUrl: vi.fn(),
}));

const transactionHistoryMocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
}));

vi.mock("../app/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...a: any[]) =>
    mocks.createWorkspaceTwilioInstance(...a),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
}));
vi.mock("@/twilio.server", () => ({ validateTwilioWebhookParams: (...a: any[]) => mocks.validateTwilioWebhookParams(...a) }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: any[]) => telephonyDbMocks.findCallBySid(...args),
  upsertCallBySid: (...args: any[]) => telephonyDbMocks.upsertCallBySid(...args),
  updateOutreachAttemptForWorkspace: (...args: any[]) =>
    telephonyDbMocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcTryCompleteCampaignIfDrained: (...args: unknown[]) =>
    rpcMocks.rpcTryCompleteCampaignIfDrained(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...args: unknown[]) => tenantDbMocks.createTenantDb(...args),
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignWithScript: (...args: any[]) => campaignIvrMocks.fetchCampaignWithScript(...args),
  resolveCampaignScript: (...args: any[]) => campaignIvrMocks.resolveCampaignScript(...args),
}));
vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...args: any[]) => objectStorageMocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) =>
    transactionHistoryMocks.insertTransactionHistoryIdempotent(...args),
}));

function makeReq(fields: Record<string, any>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/ivr/status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

function makeCallRow(overrides?: any) {
  return {
    sid: "CA1",
    outreach_attempt_id: 1,
    workspace: "w1",
    campaign_id: 1,
    ...overrides,
  };
}

function makeCampaign(overrides?: any) {
  return {
    id: 1,
    workspace: "w1",
    title: "C",
    voicemail_file: "v.mp3",
    voicemail_drop_enabled: true,
    script: { steps: { pages: {} } },
    ...overrides,
  };
}

describe("app/routes/api+/ivr/status.route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockImplementation(async (args: {
      params?: Record<string, string>;
    }) => (null));
    mocks.logger.error.mockReset();
    telephonyDbMocks.findCallBySid.mockReset();
    telephonyDbMocks.upsertCallBySid.mockReset();
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockReset();
    campaignIvrMocks.fetchCampaignWithScript.mockReset();
    campaignIvrMocks.resolveCampaignScript.mockReset();
    objectStorageMocks.createSignedObjectUrl.mockReset();
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockReset();
    telephonyDbMocks.findCallBySid.mockResolvedValue(makeCallRow());
    telephonyDbMocks.upsertCallBySid.mockImplementation(async (update: Record<string, unknown>) => ({
      ...makeCallRow(),
      ...update,
    }));
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValue(makeCampaign({ type: "robocall" }));
    campaignIvrMocks.resolveCampaignScript.mockImplementation((campaign: any) => campaign?.script ?? null);
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValue({});
    objectStorageMocks.createSignedObjectUrl.mockResolvedValue("https://signed");
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true, existingId: 1 });
    rpcMocks.rpcTryCompleteCampaignIfDrained.mockReset();
    rpcMocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(false);
    tenantDbMocks.createTenantDb.mockReset();
    tenantDbMocks.createTenantDb.mockImplementation(() => ({ __tenant: true }));
  });

  test("returns 403 on invalid signature", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const mod = await import("../app/routes/api+/ivr/status.route");
    const res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1" }) } as any),
    );
    expect(res.status).toBe(403);
  });

  test("handles failed/no-answer/completed status updates", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const mod = await import("../app/routes/api+/ivr/status.route");

    let res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "failed", Timestamp: new Date().toISOString() }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "no-answer", Timestamp: new Date().toISOString() }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("machine answer records the voicemail disposition when the drop plays; playback is owned by the flow route (#1864)", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      1,
      { disposition: "voicemail", answered_at: expect.any(String) },
    );
  });

  test("machine answer with the drop off records no-answer, not voicemail (#1888)", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    // Drop switch off (or no audio): the flow entry hangs up without playing a
    // message, so the operator must see No Answer. No `answered_at` either —
    // analytics reads a present `answered_at` as a connected call.
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      voicemail_drop_enabled: false,
      voicemail_file: null,
    }));

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      1,
      { disposition: "no-answer" },
    );
  });

  test("covers catch paths: call not found/workspace missing/outreach_attempt_id missing", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");

    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(null);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    let res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1" }) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(makeCallRow({ workspace: null }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1" }) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(makeCallRow({ outreach_attempt_id: null }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }) } as any));
    // processCallStatusWebhook accepts a null outreachAttemptId; no updateResult call needed
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("handleVoicemail updateResult error is caught", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(makeCallRow());
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "synthetic", say: "hi" } } } },
    }));
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 500 }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers dbCall null and the machine disposition error throw", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");

    // dbCall null (callError null) => "Call not found"
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(null);
    let res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1" }) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // updateResult error throw (machine path)
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 500 }));
    res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("covers completed branch and upsertCallBySid error branch", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

    // completed branch success
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(makeCallRow());
    let res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    // upsertCallBySid error => catch
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    telephonyDbMocks.upsertCallBySid.mockRejectedValueOnce(new Error("call-update"));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "failed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // ensure completed branch catches upsertCallBySid errors too
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    telephonyDbMocks.upsertCallBySid.mockRejectedValueOnce(new Error("completed-update"));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  test("explicitly hits completed branch and debits credits once", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");

    const res = await asRouteResponse(mod.action({
      request: makeReq({
        CallSid: "CA1",
        CallStatus: "completed",
        CallDuration: "10",
        Duration: "10",
        Timestamp: new Date().toISOString(),
      }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(telephonyDbMocks.upsertCallBySid).toHaveBeenCalled();
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        idempotencyKey: "call:CA1",
        type: "DEBIT",
      }),
    );
  });

  test("does not bill failed or no-answer IVR callbacks", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({ calls: () => ({ update: async () => ({}) }) });

    let res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "failed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "no-answer", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test.each([
    ["completed"],
    ["failed"],
    ["no-answer"],
  ])("records %s as the outreach disposition so results are not filtered out", async (callStatus) => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: callStatus, Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });

    // `get_campaign_stats` filters out attempts whose disposition is NULL, so a
    // terminal callback that only persists the `call` row leaves the campaign
    // results screen empty.
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      1,
      expect.objectContaining({ disposition: callStatus }),
    );
  });

  test("skips the disposition write when the call has no outreach attempt", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(makeCallRow({ outreach_attempt_id: null }));

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("covers switch default (non-terminal callStatus, non-machine)", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "human", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  /**
   * The payload is parsed once at the route boundary into a discriminated
   * union (#1243 E1/E2). A `CallSid` with no `CallStatus` at all discriminates
   * to `unrecognized` — the route must still ack (not throw), and must not
   * treat it as machine detection or a terminal status.
   */
  test("an unrecognized payload (CallSid with no CallStatus) acks without billing or disposition writes", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", SomethingTwilioAddedLater: "1" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(telephonyDbMocks.upsertCallBySid).not.toHaveBeenCalled();
    expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("a non-terminal (answering) callback does not trigger campaign completion", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "in-progress", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcMocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();
  });

  test.each(["busy", "canceled"])(
    "persists %s as terminal and asks the campaign completion gate",
    async (callStatus) => {
      const mod = await import("../app/routes/api+/ivr/status.route");
      mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });

      const res = await asRouteResponse(mod.action({
        request: makeReq({ CallSid: "CA1", CallStatus: callStatus, Timestamp: new Date().toISOString() }),
      } as any));
      await expect(res.json()).resolves.toEqual({ success: true });
      expect(telephonyDbMocks.upsertCallBySid).toHaveBeenCalled();
      expect(telephonyDbMocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
        "w1",
        1,
        { disposition: callStatus },
      );
      expect(rpcMocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledWith(
        { __tenant: true },
        1,
      );
    },
  );

  test("completing the last settled call reports the campaign complete (#1728)", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    rpcMocks.rpcTryCompleteCampaignIfDrained.mockResolvedValueOnce(true);

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "campaign.completed_on_settled_call",
      expect.objectContaining({ campaignId: 1 }),
    );
  });

  test("a failing completion gate never fails the status webhook", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    rpcMocks.rpcTryCompleteCampaignIfDrained.mockRejectedValueOnce(new Error("gate-down"));

    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "campaign.complete_on_settled_call_failed",
      expect.objectContaining({ campaignId: 1 }),
    );
  });
});
