import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

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

function makeDbClientStub(args: { currentDisposition: string }) {
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

  return { from, realtime: { channel: () => ({ send: vi.fn() }) }, rpc: async () => ({ data: { id: 1, inserted: true }, error: null }), _outreachUpdateCalls: outreachUpdateCalls };
}

let postgresStub: ReturnType<typeof makeDbClientStub>;
const clientState = vi.hoisted(() => ({ client: null as any }));

vi.mock("@client/client-js", () => ({
  createClient: () => clientState.client,
}));
vi.mock("@/lib/auth.server", () => ({
  getAdminDb: () => clientState.client,
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForCallSid: vi.fn(async () => ({ ok: true as const })),
}));

describe("outreach disposition transitions", () => {
  beforeEach(() => {
    twilioMocks.validateTwilioWebhookParams.mockReset();
    twilioMocks.validateTwilioWebhookParams.mockReturnValue(true);
  });

  test("api.call-status does not overwrite terminal disposition with a different value", async () => {
    postgresStub = makeDbClientStub({ currentDisposition: "completed" });
    clientState.client = postgresStub as any;

    const mod = await import("../app/routes/api+/call-status");
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

    const res = await asRouteResponse(await mod.action({ request: req } as any));
    expect(res.status).toBe(200);
    expect(postgresStub._outreachUpdateCalls.length).toBe(0);
  });
});

