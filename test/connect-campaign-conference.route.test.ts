import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(),
  getAdminDb: vi.fn(),
  findCampaignInWorkspace: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env.server", () => ({
  env: { BASE_URL: () => "https://base.example" },
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
  twilioWebhookForbidden: (message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: (...args: unknown[]) => mocks.findCampaignInWorkspace(...args),
}));

vi.mock("@/lib/auth.server", () => ({
  getAdminDb: () => mocks.null /* removed service client */,
}));

describe("app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.getAdminDb.mockReturnValue({});
    mocks.findCampaignInWorkspace.mockResolvedValue({ id: 1 });
    mocks.logger.error.mockReset();
  });

  test("returns TwiML with campaign conference name when signature validates", async () => {
    const mod = await import(
      "../app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route"
    );
    const res = await asRouteResponse(mod.loader({
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
    expect(body).toContain("<Dial>");
    expect(body).toContain(">campaign-w1-1</Conference>");
  });

  test("rejects unauthenticated Twilio requests", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }));

    const mod = await import(
      "../app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route"
    );
    const res = await asRouteResponse(mod.loader({
        request: new Request(
          "https://base.example/api/connect-campaign-conference/w1/c1",
        ),
        params: { workspaceId: "w1", campaignId: "1" },
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns fallback TwiML (not an HTML error page) when an unexpected error is thrown", async () => {
    mocks.findCampaignInWorkspace.mockRejectedValueOnce(new Error("db down"));

    const mod = await import(
      "../app/routes/api+/connect-campaign-conference/$workspaceId/$campaignId.route"
    );
    const res = await asRouteResponse(mod.loader({
        request: new Request(
          "https://base.example/api/connect-campaign-conference/w1/c1",
        ),
        params: { workspaceId: "w1", campaignId: "1" },
      } as never),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain(
      "<Say>We're unable to take your call right now. Please try again later.</Say>",
    );
    expect(body).toContain("<Hangup/>");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Unhandled error in api.connect-campaign-conference",
      expect.objectContaining({ error: "db down" }),
    );
  });
});
