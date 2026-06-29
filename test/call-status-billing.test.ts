import { describe, expect, test, vi, beforeEach } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  makeApplyLedgerEntryRpcStub,
  type TransactionRow,
} from "./helpers/transaction-history-stub";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const twilioMocks = vi.hoisted(() => {
  return {
    validateTwilioWebhookParams: vi.fn(() => true),
  };
});
vi.mock("@/twilio.server", () => {
  return {
    validateTwilioWebhookParams: twilioMocks.validateTwilioWebhookParams,
    shouldValidateTwilioWebhooks: () => true,
  };
});

function makeSupabaseStub() {
  const transactionRows: TransactionRow[] = [];

  const realtime = {
    channel: () => ({ send: vi.fn() }),
  };

  const from = (table: string) => {
    if (table === "call") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        upsert: (rows: any[]) => ({
          select: async () => ({
            data: [
              {
                ...rows[0],
                workspace: "w1",
                outreach_attempt_id: null,
                parent_call_sid: null,
              },
            ],
            error: null,
          }),
        }),
      };
    }

    if (table === "workspace") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { twilio_data: { sid: "AC_test", authToken: "twilio-token" } },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "outreach_attempt") {
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.single = async () => ({ data: null, error: null });
      builder.update = () => builder;
      return builder;
    }

    if (table === "transaction_history") {
      return makeApplyLedgerEntryRpcStub(transactionRows) as any;
    }

    throw new Error(`unexpected table ${table}`);
  };

  return { realtime, from, rpc: makeApplyLedgerEntryRpcStub(transactionRows), _transactionRows: transactionRows };
}

let supabaseStub: ReturnType<typeof makeSupabaseStub>;

const supabaseState = vi.hoisted(() => {
  return { supabase: null as any };
});
vi.mock("@/lib/supabase.server", () => ({
  getServiceSupabase: () => supabaseState.supabase,
}));
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: () => supabaseState.supabase,
  };
});

describe("api.call-status billing + idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseStub = makeSupabaseStub();
    supabaseState.supabase = supabaseStub as any;
    twilioMocks.validateTwilioWebhookParams.mockReset();
    twilioMocks.validateTwilioWebhookParams.mockReturnValue(true);
  });

  test("rejects invalid Twilio signature", async () => {
    twilioMocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
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

    const amounts = supabaseStub._transactionRows.map((r) => r.amount);
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

    const matching = supabaseStub._transactionRows.filter(
      (r) => r.idempotency_key === "call:CA_DUP:staffed",
    );
    expect(matching.length).toBe(1);
  });
});

