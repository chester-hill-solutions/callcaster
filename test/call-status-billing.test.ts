import { describe, expect, test, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { type TransactionRow } from "./helpers/transaction-history-stub";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const twilioWebhookMocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(async () => (null)),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: any[]) =>
    twilioWebhookMocks.requireTwilioSignature(...args),
}));

const telephonyDbMocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(async () => null),
  upsertCallBySid: vi.fn(async (values: any) => ({
    workspace: "w1",
    outreach_attempt_id: null,
    parent_call_sid: null,
    campaign_id: null,
    sid: values.sid,
  })),
  findOutreachAttemptWithCampaignType: vi.fn(async () => null),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ id: 1 })),
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
  emitPostgresChangeEvent: vi.fn(async () => null),
}));

const enqueueJobMock = vi.hoisted(() => vi.fn(async () => ({ enqueued: true, jobId: 1 })));

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

const transactionRowsState = vi.hoisted(() => ({ rows: [] as TransactionRow[] }));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: vi.fn(async (_exec: unknown, args: any) => {
    const existing = transactionRowsState.rows.find(
      (r) =>
        r.workspace === args.workspaceId &&
        r.idempotency_key === args.idempotencyKey,
    );
    if (existing) {
      return { inserted: false, existingId: existing.id };
    }
    const row: TransactionRow = {
      id: transactionRowsState.rows.length + 1,
      workspace: args.workspaceId,
      type: args.type,
      amount: args.amount,
      note: args.note,
      idempotency_key: args.idempotencyKey,
      created_at: new Date().toISOString(),
    };
    transactionRowsState.rows.push(row);
    return { inserted: true, existingId: row.id };
  }),
}));

function resetTransactionRows() {
  transactionRowsState.rows = [];
}

describe("api.call-status billing + idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
    resetTransactionRows();
    twilioWebhookMocks.requireTwilioSignature.mockReset();
    twilioWebhookMocks.requireTwilioSignature.mockResolvedValue(null);
    enqueueJobMock.mockReset();
    enqueueJobMock.mockResolvedValue({ enqueued: true, jobId: 1 });
    telephonyDbMocks.findCallBySid.mockReset();
    telephonyDbMocks.upsertCallBySid.mockReset();
    telephonyDbMocks.findOutreachAttemptWithCampaignType.mockReset();
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockReset();
    telephonyDbMocks.upsertCallBySid.mockImplementation(async (values: any) => ({
      workspace: "w1",
      outreach_attempt_id: null,
      parent_call_sid: null,
      campaign_id: null,
      sid: values.sid,
      status: values.status,
      duration: values.duration,
      call_duration: values.call_duration,
    }));
    telephonyDbMocks.findCallBySid.mockImplementation(async (sid: string) => ({
      workspace: "w1",
      sid,
      status: "completed",
      duration: sid === "CA61" ? "61" : sid.startsWith("CA6") ? "60" : "1",
      call_duration: sid === "CA61" ? "61" : sid.startsWith("CA6") ? "60" : "1",
      outreach_attempt_id: null,
      campaign_id: null,
    }));
  });

  test("rejects invalid Twilio signature", async () => {
    twilioWebhookMocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/call-status");
    const fd = new FormData();
    fd.set("CallSid", "CA_BAD");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");

    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "bad" },
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(403);
  });

  test("route enqueues side-effects job instead of inline billing", async () => {
    const mod = await import("../app/routes/api+/call-status");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");

    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "call_status_side_effects" }),
    );
    expect(transactionRowsState.rows).toHaveLength(0);
  });

  test("bills staffed rates via side-effects handler: 4 credits for 1-60s, 9 credits for 61s", async () => {
    const { runCallStatusSideEffects } = await import(
      "../app/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA1",
      twilioParams: { CallSid: "CA1", CallStatus: "completed", Duration: "1" },
    });
    await runCallStatusSideEffects({
      callSid: "CA60",
      twilioParams: { CallSid: "CA60", CallStatus: "completed", Duration: "60" },
    });
    await runCallStatusSideEffects({
      callSid: "CA61",
      twilioParams: { CallSid: "CA61", CallStatus: "completed", Duration: "61" },
    });

    const amounts = transactionRowsState.rows.map((r) => r.amount);
    expect(amounts).toEqual([-4, -4, -9]);
  });

  test("does not bill zero-duration terminal staffed calls (failed/busy/no-answer)", async () => {
    telephonyDbMocks.findCallBySid.mockImplementation(async (sid: string) => ({
      workspace: "w1",
      sid,
      status: sid.replace("CA_", "").toLowerCase(),
      duration: "0",
      call_duration: "0",
      outreach_attempt_id: null,
      campaign_id: null,
    }));

    const { runCallStatusSideEffects } = await import(
      "../app/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA_FAILED",
      twilioParams: { CallSid: "CA_FAILED", CallStatus: "failed", Duration: "0" },
    });
    await runCallStatusSideEffects({
      callSid: "CA_BUSY",
      twilioParams: { CallSid: "CA_BUSY", CallStatus: "busy", Duration: "0" },
    });
    await runCallStatusSideEffects({
      callSid: "CA_NOANSWER",
      twilioParams: { CallSid: "CA_NOANSWER", CallStatus: "no-answer", Duration: "0" },
    });

    expect(transactionRowsState.rows).toHaveLength(0);
  });

  test("is idempotent across duplicate side-effect runs (same CallSid)", async () => {
    telephonyDbMocks.findCallBySid.mockResolvedValue({
      workspace: "w1",
      sid: "CA_DUP",
      status: "completed",
      duration: "61",
      call_duration: "61",
      outreach_attempt_id: null,
      campaign_id: null,
    });

    const { runCallStatusSideEffects } = await import(
      "../app/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA_DUP",
      twilioParams: { CallSid: "CA_DUP", CallStatus: "completed", Duration: "61" },
    });
    await runCallStatusSideEffects({
      callSid: "CA_DUP",
      twilioParams: { CallSid: "CA_DUP", CallStatus: "completed", Duration: "61" },
    });

    const matching = transactionRowsState.rows.filter(
      (r) => r.idempotency_key === "call:CA_DUP",
    );
    expect(matching.length).toBe(1);
  });
});

describe("processCallStatusWebhook single source of truth", () => {
  beforeEach(() => {
    resetTransactionRows();
    telephonyDbMocks.upsertCallBySid.mockImplementation(async (values: any) => ({
      workspace: "w1",
      outreach_attempt_id: null,
      parent_call_sid: null,
      campaign_id: null,
      sid: values.sid,
      status: values.status,
      duration: values.duration,
      call_duration: values.call_duration,
    }));
  });

  function makeParams(status: string, duration: string, sid: string) {
    const fd = new FormData();
    fd.set("CallSid", sid);
    fd.set("CallStatus", status);
    fd.set("Duration", duration);
    fd.set("CallDuration", duration);
    fd.set("Timestamp", new Date().toISOString());
    return Object.fromEntries(fd.entries()) as Record<string, string>;
  }

  test("same CallSid is billed exactly once across multiple terminal callbacks", async () => {
    const {
      processCallStatusWebhook,
      buildCallUpsertFromTwilioParams,
    } = await import("../app/lib/twilio-call-status.server");

    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("completed", "10", "CA_MULTI")),
      { campaignType: "predictive" },
    );
    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("busy", "0", "CA_MULTI")),
      { campaignType: "predictive" },
    );
    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("no-answer", "0", "CA_MULTI")),
      { campaignType: "predictive" },
    );

    expect(transactionRowsState.rows).toHaveLength(1);
    // Key is CallSid-only — the billing kind is never part of the key.
    expect(transactionRowsState.rows[0].idempotency_key).toBe("call:CA_MULTI");
  });

  test("IVR completed calls are billed once under the CallSid key", async () => {
    const {
      processCallStatusWebhook,
      buildCallUpsertFromTwilioParams,
    } = await import("../app/lib/twilio-call-status.server");

    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("completed", "10", "CA_IVR")),
      { campaignType: "robocall" },
    );
    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("completed", "10", "CA_IVR")),
      { campaignType: "robocall" },
    );

    expect(transactionRowsState.rows).toHaveLength(1);
    expect(transactionRowsState.rows[0].idempotency_key).toBe("call:CA_IVR");
  });

  test("same CallSid billed once even when deliveries resolve different kinds (double-charge guard)", async () => {
    const {
      processCallStatusWebhook,
      buildCallUpsertFromTwilioParams,
    } = await import("../app/lib/twilio-call-status.server");

    // Delivery A resolves robocall→ivr; delivery B (transient lookup failure)
    // falls back to staffed. Pre-fix these hashed to call:sid:ivr vs
    // call:sid:staffed and BOTH debited. Now both map to call:CA_KIND.
    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("completed", "10", "CA_KIND")),
      { campaignType: "robocall" },
    );
    await processCallStatusWebhook(
      buildCallUpsertFromTwilioParams(makeParams("completed", "10", "CA_KIND")),
      { campaignType: "predictive" },
    );

    expect(transactionRowsState.rows).toHaveLength(1);
    expect(transactionRowsState.rows[0].idempotency_key).toBe("call:CA_KIND");
  });
});

