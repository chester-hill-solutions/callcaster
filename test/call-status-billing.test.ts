import { describe, expect, test, vi, beforeEach } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { type TransactionRow } from "./helpers/transaction-history-stub";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

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
  findCallBySid: vi.fn(async () => null),
  upsertCallBySid: vi.fn(async () => ({
    workspace: "w1",
    outreach_attempt_id: null,
    parent_call_sid: null,
    campaign_id: null,
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
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockReset();
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockResolvedValue({
      ok: true,
      params: {},
      authToken: "tok",
    });
    telephonyDbMocks.findCallBySid.mockReset();
    telephonyDbMocks.upsertCallBySid.mockReset();
    telephonyDbMocks.findOutreachAttemptWithCampaignType.mockReset();
    telephonyDbMocks.updateOutreachAttemptForWorkspace.mockReset();
    telephonyDbMocks.upsertCallBySid.mockResolvedValue({
      workspace: "w1",
      outreach_attempt_id: null,
      parent_call_sid: null,
      campaign_id: null,
    });
  });

  test("rejects invalid Twilio signature", async () => {
    twilioWebhookMocks.validateTwilioWebhookForCallSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
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

  test("bills staffed rates: 4 credits for 0-60s, 9 credits for 61s", async () => {
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

    await mod.action({ request: makeReq("CA0", "0") } as any);
    await mod.action({ request: makeReq("CA60", "60") } as any);
    await mod.action({ request: makeReq("CA61", "61") } as any);

    const amounts = transactionRowsState.rows.map((r) => r.amount);
    expect(amounts).toEqual([-4, -4, -9]);
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
      (r) => r.idempotency_key === "call:CA_DUP:staffed",
    );
    expect(matching.length).toBe(1);
  });
});

