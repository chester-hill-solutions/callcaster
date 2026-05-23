import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    validateTwilioWebhookForCallSid: vi.fn(),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "tok",
    },
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => mocks.createClient(...a) }));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForCallSid: (...a: unknown[]) =>
    mocks.validateTwilioWebhookForCallSid(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    redirect(u: string) {
      this.parts.push(`redirect:${u}`);
    }
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    hangup() {
      this.parts.push("hangup");
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeSupabase(sequence: Array<{ data: unknown; error: unknown }>) {
  let i = 0;
  return {
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                const r = sequence[Math.min(i, sequence.length - 1)];
                i += 1;
                return r;
              },
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
}

describe("app/routes/api+/ivr/route.$campaignId.$pageId.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookForCallSid.mockReset();
    mocks.validateTwilioWebhookForCallSid.mockResolvedValue({
      ok: true,
      params: { CallSid: "CA1" },
      authToken: "tok",
    });
    mocks.logger.error.mockReset();
  });

  test("returns 400 when required params missing", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: null, error: null }]));
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const res = await asRouteResponse(await mod.action({
      params: {},
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as never));
    expect(res.status).toBe(400);
  });

  test("returns 403 on invalid signature", async () => {
    mocks.validateTwilioWebhookForCallSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    const callData = { workspace: "w1", campaign: { ivr_campaign: [{ script: { steps: { pages: { page_1: { blocks: ["b1"] } } } } }] } };
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: callData, error: null }]));
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never));
    expect(res.status).toBe(403);
  });

  test("redirects to first block; says error when page invalid; catch path for invalid script and retry failure", async () => {
    const mod = await import("../app/routes/api+/ivr/$campaignId/$pageId.route");

    // success
    const callData = { workspace: "w1", campaign: { ivr_campaign: [{ script: { steps: { pages: { page_1: { blocks: ["b1"] } } } } }] } };
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: callData, error: null }]));
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    let res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toContain("redirect:/api/ivr/1/page_1/b1");

    // page missing blocks => say+hangup
    const callData2 = { workspace: "w1", campaign: { ivr_campaign: [{ script: { steps: { pages: { page_1: { blocks: [] } } } } }] } };
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: callData2, error: null }]));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toContain("There was an error in the IVR flow");

    // invalid script => catch
    const callData3 = { workspace: "w1", campaign: { ivr_campaign: [{ script: { steps: null } }] } };
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: callData3, error: null }]));
    res = await mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    expect(await res.text()).toContain("An error occurred. Please try again later.");

    // retry failure without waiting (fake timers)
    vi.useFakeTimers();
    mocks.createClient.mockReturnValueOnce(makeSupabase([{ data: null, error: new Error("no") }]));
    const p = mod.action({
      params: { campaignId: "1", pageId: "page_1" },
      request: new Request("http://x", { method: "POST", headers: { "x-twilio-signature": "sig" }, body: fd }),
    } as never);
    await vi.runAllTimersAsync();
    res = await p;
    expect(await res.text()).toContain("An error occurred. Please try again later.");
    vi.useRealTimers();
  });
});
