import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  validateTwilioWebhookForWorkspace: vi.fn(),
  getServiceSupabase: vi.fn(),
  findCampaignInWorkspace: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  env: { BASE_URL: () => "https://base.example" },
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForWorkspace: (...args: unknown[]) =>
    mocks.validateTwilioWebhookForWorkspace(...args),
  twilioWebhookForbidden: (message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: (...args: unknown[]) => mocks.findCampaignInWorkspace(...args),
}));

vi.mock("@/lib/supabase.server", () => ({
  getServiceSupabase: () => mocks.getServiceSupabase(),
}));

vi.mock("twilio/lib/twiml/VoiceResponse.js", () => {
  class VoiceResponse {
    private parts: string[] = [];
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    pause(opts: { length?: number }) {
      this.parts.push(`pause:${opts?.length}`);
    }
    dial() {
      return {
        conference: (_opts: unknown, name: string) => {
          this.parts.push(`conf:${name}`);
        },
      };
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: VoiceResponse };
});

describe("app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validateTwilioWebhookForWorkspace.mockResolvedValue({
      ok: true,
      params: {},
      authToken: "token",
      workspaceId: "w1",
    });
    mocks.getServiceSupabase.mockReturnValue({});
    mocks.findCampaignInWorkspace.mockResolvedValue({ id: 1 });
  });

  test("returns TwiML with campaign conference name when signature validates", async () => {
    const mod = await import(
      "../app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route"
    );
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request(
          "https://base.example/api/connect-campaign-conference/w1/c1?CallSid=CA1",
          {
            headers: { "X-Twilio-Signature": "sig" },
          },
        ),
        params: { workspaceId: "w1", campaignId: "1" },
      } as never),
    );
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("conf:campaign-w1-1");
  });

  test("rejects unauthenticated Twilio requests", async () => {
    mocks.validateTwilioWebhookForWorkspace.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const mod = await import(
      "../app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route"
    );
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request(
          "https://base.example/api/connect-campaign-conference/w1/c1",
        ),
        params: { workspaceId: "w1", campaignId: "1" },
      } as never),
    );
    expect(res.status).toBe(403);
  });
});
