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

const campaignIvrMocks = vi.hoisted(() => ({
  fetchCampaignWithScript: vi.fn(),
}));

const callStatusMocks = vi.hoisted(() => ({
  persistCallStatusFromParams: vi.fn(),
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
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    fetchCampaignWithScript: (...args: any[]) => campaignIvrMocks.fetchCampaignWithScript(...args),
  };
});
vi.mock("@/lib/twilio-call-status.server", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    persistCallStatusFromParams: (...args: any[]) => callStatusMocks.persistCallStatusFromParams(...args),
  };
});
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
    callStatusMocks.persistCallStatusFromParams.mockReset();
    objectStorageMocks.createSignedObjectUrl.mockReset();
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockReset();
    telephonyDbMocks.findCallBySid.mockResolvedValue(makeCallRow());
    telephonyDbMocks.upsertCallBySid.mockResolvedValue(makeCallRow());
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValue(makeCampaign({ type: "robocall" }));
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValue({});
    callStatusMocks.persistCallStatusFromParams.mockResolvedValue(undefined);
    objectStorageMocks.createSignedObjectUrl.mockResolvedValue("https://signed");
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true, existingId: 1 });
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

  test("machine voicemail branches: no page => hangup; synthetic => say; recorded => play; errors bubble to catch", async () => {
    const callUpdate = vi.fn(async (_p: any) => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({ calls: () => ({ update: callUpdate }) });
    const mod = await import("../app/routes/api+/ivr/status.route");

    // no voicemail page
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { page_1: { title: "Other", blocks: [] } } } },
    }));
    let res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Hangup/>") }),
    );

    // synthetic voicemail page
    callUpdate.mockClear();
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "synthetic", say: "hi" } } } },
    }));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Pause length=\"1\"/><Say>hi</Say>") }),
    );

    // recorded voicemail page -> play signedUrl
    callUpdate.mockClear();
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } },
    }));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Pause length=\"1\"/><Play>https://signed</Play>") }),
    );

    // errors: recorded voicemail but missing voicemail_file => catch
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      voicemail_file: null,
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } },
    }));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
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
    // persistCallStatusFromParams accepts null outreachAttemptId; no updateResult call needed
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

  test("covers remaining voicemail recorded signedUrl error/missing, pagesObject undefined, dbCall null, timestamp fallback, and updateResult error throw", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    const callUpdate = vi.fn(async (_p: any) => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({ calls: () => ({ update: callUpdate }) });

    // dbCall null (callError null) => "Call not found"
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(null);
    let res = await asRouteResponse(mod.action({ request: makeReq({ CallSid: "CA1" }) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // pagesObject undefined => findVoicemailPage early return null => hangup update
    callUpdate.mockClear();
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: null },
    }));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Hangup/>") }),
    );

    // recorded: signedUrlError => throws {Status_Error: ...} and caught
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } },
    }));
    objectStorageMocks.createSignedObjectUrl.mockRejectedValueOnce(new Error("sig"));
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    // recorded: signedUrl returns null => current code still issues play (no throw)
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "recorded" } } } },
    }));
    objectStorageMocks.createSignedObjectUrl.mockResolvedValueOnce(null as any);
    res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "machine_start" }),
    } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true });

    // timestamp fallback '' + updateResult error throw (machine path)
    campaignIvrMocks.fetchCampaignWithScript.mockResolvedValueOnce(makeCampaign({
      script: { steps: { pages: { vm: { title: "Voicemail", blocks: [], speechType: "synthetic", say: "hi" } } } },
    }));
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

  test("covers switch default (non-terminal callStatus, non-machine)", async () => {
    const mod = await import("../app/routes/api+/ivr/status.route");
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const res = await asRouteResponse(mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", AnsweredBy: "human", Timestamp: new Date().toISOString() }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
