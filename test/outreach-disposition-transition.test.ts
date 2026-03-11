import { beforeEach, describe, expect, test, vi } from "vitest";

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
  };
});

function makeSupabaseStub(args: { currentDisposition: string }) {
  const outreachUpdateCalls: any[] = [];

  const from = (table: string) => {
    if (table === "call") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { workspace: "w1" }, error: null }),
          }),
        }),
        upsert: (rows: any[]) => ({
          select: async () => ({
            data: [
              {
                ...rows[0],
                workspace: "w1",
                outreach_attempt_id: 123,
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
              data: { twilio_data: { authToken: "twilio-token" } },
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
      builder.single = async () => ({
        data: { disposition: args.currentDisposition, contact_id: 1, workspace: "w1" },
        error: null,
      });
      builder.update = (patch: any) => {
        outreachUpdateCalls.push(patch);
        return builder;
      };
      return builder;
    }

    if (table === "transaction_history") {
      // Not relevant for this suite; satisfy idempotency helper calls if they happen.
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.like = () => builder;
      builder.order = () => builder;
      builder.limit = async () => ({ data: [], error: null });
      builder.insert = () => ({
        select: () => ({
          single: async () => ({ data: { id: 1 }, error: null }),
        }),
      });
      return builder;
    }

    throw new Error(`unexpected table ${table}`);
  };

  return { from, realtime: { channel: () => ({ send: vi.fn() }) }, _outreachUpdateCalls: outreachUpdateCalls };
}

let supabaseStub: ReturnType<typeof makeSupabaseStub>;
const supabaseState = vi.hoisted(() => ({ supabase: null as any }));

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: () => supabaseState.supabase,
  };
});

describe("outreach disposition transitions", () => {
  beforeEach(() => {
    twilioMocks.validateTwilioWebhookParams.mockReset();
    twilioMocks.validateTwilioWebhookParams.mockReturnValue(true);
  });

  test("api.call-status does not overwrite terminal disposition with a different value", async () => {
    supabaseStub = makeSupabaseStub({ currentDisposition: "completed" });
    supabaseState.supabase = supabaseStub as any;

    const mod = await import("../app/routes/api.call-status");
    const fd = new FormData();
    fd.set("CallSid", "CA_TERM");
    fd.set("CallStatus", "ringing");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "0");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(200);
    expect(supabaseStub._outreachUpdateCalls.length).toBe(0);
  });
});

