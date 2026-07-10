import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(),
  handleAcdRouterRequest: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) => mocks.requireTwilioSignature(...args),
}));
vi.mock("@/lib/acd/acd-router.server", () => ({
  handleAcdRouterRequest: (...args: unknown[]) => mocks.handleAcdRouterRequest(...args),
}));
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
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeRequest() {
  const fd = new FormData();
  fd.set("CallSid", "CA1");
  return new Request("http://localhost/api/acd-router", { method: "POST", body: fd });
}

describe("app/routes/api+/acd-router", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.handleAcdRouterRequest.mockReset();
    mocks.handleAcdRouterRequest.mockResolvedValue(
      new Response("<Response><Say>waiting</Say></Response>", {
        headers: { "Content-Type": "text/xml" },
      }),
    );
    mocks.logger.error.mockReset();
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid Twilio signature" }), { status: 403 }),
    );
    const mod = await import("../app/routes/api+/acd-router.route");
    const res = await asRouteResponse(await mod.action({ request: makeRequest() } as never));
    expect(res.status).toBe(403);
  });

  test("delegates to handleAcdRouterRequest on the happy path", async () => {
    const mod = await import("../app/routes/api+/acd-router.route");
    const res = await asRouteResponse(await mod.action({ request: makeRequest() } as never));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toContain("waiting");
  });

  test("returns fallback TwiML (not an HTML error page) when signature validation throws unexpectedly", async () => {
    mocks.requireTwilioSignature.mockRejectedValueOnce(new Error("signature check exploded"));
    const mod = await import("../app/routes/api+/acd-router.route");
    const res = await asRouteResponse(await mod.action({ request: makeRequest() } as never));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const text = await res.text();
    expect(text).toContain("say:");
    expect(text).toContain("hangup");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Unhandled error in api.acd-router",
      expect.objectContaining({ error: "signature check exploded" }),
    );
  });
});
