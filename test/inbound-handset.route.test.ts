import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  validateTwilioWebhookForPhoneNumber: vi.fn(),
  env: {
    SUPABASE_URL: () => "https://sb.example",
    SUPABASE_SERVICE_KEY: () => "svc",
  },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForPhoneNumber: (...args: unknown[]) =>
    mocks.validateTwilioWebhookForPhoneNumber(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    say(text: string) {
      this.parts.push(`say:${text}`);
    }
    hangup() {
      this.parts.push("hangup");
    }
    dial() {
      return {
        client: (identity: string) => {
          this.parts.push(`client:${identity}`);
        },
      };
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeSupabase(opts?: {
  numberRow?: { workspace: string } | null;
  session?: { client_identity: string } | null;
}) {
  return {
    from: (table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts?.numberRow ?? { workspace: "w1" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "handset_session") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: opts?.session ?? { client_identity: "agent-1" },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeRequest(called = "+15551234567") {
  const fd = new FormData();
  fd.set("Called", called);
  return new Request("http://localhost/api/inbound-handset", { method: "POST", body: fd });
}

describe("app/routes/api+/inbound-handset", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookForPhoneNumber.mockReset();
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValue({
      ok: true,
      params: { Called: "+15551234567" },
      authToken: "tok",
      workspaceId: "w1",
      twilioData: { sid: "AC1", authToken: "tok" },
    });
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest() } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when Called is empty", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Missing phone number" }), {
        status: 403,
      }),
    });
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api+/inbound-handset");
    const fd = new FormData();
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/inbound-handset", {
          method: "POST",
          body: fd,
        }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when phone number is not found", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest("+19999999999") } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns TwiML dialing client on happy path", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await mod.action({ request: makeRequest() } as never);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const text = await res.text();
    expect(text).toContain("client:agent-1");
  });
});
