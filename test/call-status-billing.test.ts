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

const transactionRowsState = vi.hoisted(() => ({ rows: [] as TransactionRow[] }));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: vi.fn(async (args: any) => {
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

    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "bad" },
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(403);
  });

  test("bills staffed rates: 4 credits for 1-60s, 9 credits for 61s", async () => {
    const mod = await import("../app/routes/api+/call-status");

    const makeReq = (sid: string, duration: string) => {
      const fd = new FormData();
      fd.set("CallSid", sid);
      fd.set("CallStatus", "completed");
      fd.set("Timestamp", new Date().toISOString());
      fd.set("Duration", duration);
      fd.set("CallDuration", duration);
      fd.set("CalledVia", "client:u1");
      return new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      });
    };

    await mod.action({ request: makeReq("CA1", "1") } as any);
    await mod.action({ request: makeReq("CA60", "60") } as any);
    await mod.action({ request: makeReq("CA61", "61") } as any);

    const amounts = transactionRowsState.rows.map((r) => r.amount);
    expect(amounts).toEqual([-4, -4, -9]);
  });

  test("does not bill zero-duration terminal staffed calls (failed/busy/no-answer)", async () => {
    const mod = await import("../app/routes/api+/call-status");

    const makeReq = (sid: string, status: string) => {
      const fd = new FormData();
      fd.set("CallSid", sid);
      fd.set("CallStatus", status);
      fd.set("Timestamp", new Date().toISOString());
      fd.set("Duration", "0");
      fd.set("CallDuration", "0");
      return new Request("http://localhost/api/call-status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      });
    };

    await mod.action({ request: makeReq("CA_FAILED", "failed") } as any);
    await mod.action({ request: makeReq("CA_BUSY", "busy") } as any);
    await mod.action({ request: makeReq("CA_NOANSWER", "no-answer") } as any);

    expect(transactionRowsState.rows).toHaveLength(0);
  });

  test("is idempotent across duplicate webhook deliveries (same CallSid)", async () => {
    const mod = await import("../app/routes/api+/call-status");

    const fd = new FormData();
    fd.set("CallSid", "CA_DUP");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");

    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    await mod.action({ request: req.clone() } as any);
    await mod.action({ request: req.clone() } as any);

    const matching = transactionRowsState.rows.filter(
      (r) => r.idempotency_key === "call:CA_DUP",
    );
    expect(matching.length).toBe(1);
  });
});

describe("processCallStatusWebhook single source of truth", () => {
  beforeEach(() => {
    resetTransactionRows();
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

