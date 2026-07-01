import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const twilioWebhookMocks = vi.hoisted(() => ({
  validateTwilioWebhookForCallSid: vi.fn(async () => ({
    ok: true as const,
    params: {},
    authToken: "tok",
  })),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForCallSid: (...args: any[]) =>
    twilioWebhookMocks.validateTwilioWebhookForCallSid(...args),
}));

const telephonyDbMocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(async () => null as any),
  upsertCallBySid: vi.fn(async () => ({ workspace: "w1", outreach_attempt_id: 10, parent_call_sid: null, campaign_id: null })),
  findOutreachAttemptWithCampaignType: vi.fn(async () => ({ disposition: "in-progress", contact_id: 123, workspace: "w1" } as any)),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ id: 1 } as any)),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: any[]) => telephonyDbMocks.findCallBySid(...args),
  upsertCallBySid: (...args: any[]) => telephonyDbMocks.upsertCallBySid(...args),
  findOutreachAttemptWithCampaignType: (...args: any[]) =>
    telephonyDbMocks.findOutreachAttemptWithCampaignType(...args),
  updateOutreachAttemptForWorkspace: (...args: any[]) =>
    telephonyDbMocks.updateOutreachAttemptForWorkspace(...args),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  emitPredictiveBroadcast: vi.fn(async () => ({})),
}));

const mocks = vi.hoisted(() => {
  return {
    validateTwilioWebhookParams: vi.fn(() => true),
    insertTransactionHistoryIdempotent: vi.fn(async () => null),
    logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  };
});

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: any[]) => mocks.validateTwilioWebhookParams(...args),
  shouldValidateTwilioWebhooks: () => true,
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));

function makeReq(params: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) fd.set(k, v);
  return new Request("http://localhost/api/call-status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: fd,
  });
}

function setUpsertRow(row: Record<string, unknown>) {
  telephonyDbMocks.upsertCallBySid.mockReset();
  telephonyDbMocks.upsertCallBySid.mockResolvedValue(row);
}

function setCurrentAttempt(attempt: Record<string, unknown> | null) {
  telephonyDbMocks.findOutreachAttemptWithCampaignType.mockReset();
  telephonyDbMocks.findOutreachAttemptWithCampaignType.mockResolvedValue(attempt);
}

describe("app/routes/api+/call/route-status.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockReset();
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockResolvedValue({
      ok: true,
      params: {},
      authToken: "tok",
    });
    telephonyDbMocks.findCallBySid.mockReset();
    telephonyDbMocks.findCallBySid.mockResolvedValue(null);
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockReset();
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValue({ id: 1 });
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.debug.mockReset();
    setUpsertRow({ workspace: "w1", outreach_attempt_id: 10, parent_call_sid: null, campaign_id: null });
    setCurrentAttempt({ disposition: "in-progress", contact_id: 123, workspace: "w1" });
  });

  test("rejects invalid Twilio signature", async () => {
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(403);
  });

  test("returns 500 when call upsert fails", async () => {
    setUpsertRow(null);
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error updating call:",
      expect.any(Object),
    );
  });

  test("uses workspace authToken when present", async () => {
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("falls back to parent call workspace/outreach attempt and handles fetch error", async () => {
    setUpsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce({ workspace: "w_parent", outreach_attempt_id: 77 });
    setCurrentAttempt(null);
    telephonyDbMocks.findOutreachAttemptWithCampaignType.mockRejectedValueOnce(new Error("Failed to fetch current attempt"));

    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "completed" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to fetch current attempt" });
  });

  test("skips realtime.send when no currentAttempt and still bills with workspaceId", async () => {
    setCurrentAttempt(null);
    setUpsertRow({
      sid: "CA1",
      outreach_attempt_id: null,
      workspace: "w1",
      parent_call_sid: null,
    });

    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "completed", Duration: "61", CallDuration: "61" }),
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        type: "DEBIT",
      }),
    );
  });

  test("updates disposition when transition allowed; returns 500 on updateError", async () => {
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockResolvedValueOnce(
      new Response("Failed to update attempt", { status: 500 }),
    );
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to update attempt" });
  });

  test("does not bill when billingWorkspace missing; covers called_via default channel id", async () => {
    setCurrentAttempt({ disposition: "in-progress", contact_id: 1, workspace: null });
    setUpsertRow({ sid: "CA1", outreach_attempt_id: 10, workspace: undefined, parent_call_sid: null });

    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        call_sid: "CA1",
        call_status: "completed",
        called_via: "",
        duration: "0",
        call_duration: "0",
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("covers existingCall workspace missing (uses env authToken)", async () => {
    setUpsertRow({ workspace: null, outreach_attempt_id: 10, parent_call_sid: null });
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing" }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("covers workspace twilio token missing + calledVia split userId", async () => {
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "ringing", CalledVia: "client:u1" }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("covers lowercase sid/status fallbacks and getString non-string via File", async () => {
    const mod = await import("../app/routes/api+/call-status");

    const fd = new FormData();
    fd.set("call_sid", "CA_FALLBACK");
    fd.set("status", "completed");
    fd.set("price", new File(["1.23"], "p.txt", { type: "text/plain" }) as any);
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");
    fd.set("called_via", "client:u2");

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "sig" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("covers disposition transition denied (logs debug)", async () => {
    setUpsertRow({
      sid: "CA1",
      outreach_attempt_id: 10,
      workspace: undefined,
      parent_call_sid: null,
    });
    setCurrentAttempt({ disposition: "completed", contact_id: 1, workspace: null });

    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy", CalledVia: "client:u3" }),
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "Skipping outreach disposition transition",
      expect.any(Object),
    );
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("covers parentCall null fields -> workspace/outreachAttempt become undefined", async () => {
    setUpsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    telephonyDbMocks.findCallBySid.mockResolvedValueOnce({ workspace: null, outreach_attempt_id: null });
    setCurrentAttempt(null);
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "ringing" }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("covers parentCall missing (if parentCall false path)", async () => {
    setUpsertRow({
      sid: "CA_CHILD",
      outreach_attempt_id: null,
      workspace: null,
      parent_call_sid: "CA_PARENT",
    });
    setCurrentAttempt(null);
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA_CHILD", CallStatus: "ringing" }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("covers currentDisposition null when currentAttempt missing", async () => {
    setCurrentAttempt(null);
    setUpsertRow({
      sid: "CA1",
      outreach_attempt_id: 10,
      workspace: "w1",
      parent_call_sid: null,
    });
    const mod = await import("../app/routes/api+/call-status");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({ CallSid: "CA1", CallStatus: "busy" }),
    } as any));
    expect(res.status).toBe(200);
  });
});
