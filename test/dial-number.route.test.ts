import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    env: new Proxy(
      { BASE_URL: () => "https://base.example" },
      { get: (target, prop: string) => (target as any)[prop] ?? (() => "test") },
    ),
    dialNumberThrows: false,
    numberOpts: null as any,
  };
});

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
const requireTwilioSignatureMock = vi.fn(async () => null);
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) => requireTwilioSignatureMock(...args),
  twilioWebhookForbiddenHangup: () =>
    new Response("<Response><Say/><Hangup/></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    }),
}));
// The handler's live-transcription-enrichment block only ever ran when a
// test set CallSid — which none did until the CallSid-required auth fix
// below made it mandatory. findCallBySid was never mocked because that
// branch was never reached. Resolve null: matches "no call row found",
// which is exactly the shape the pre-fix tests implicitly exercised (no
// live-transcription TwiML appended, a plain dial).
const findCallBySidMock = vi.fn(async () => null);
vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: unknown[]) => findCallBySidMock(...args),
}));

vi.mock("twilio", () => {
  class TwilioClient {
    constructor(..._args: any[]) {}
  }
  class VoiceResponse {
    private said = false;
    private hungUp = false;
    dial(_opts: any) {
      return {
        number: (opts2: any, _num: string) => {
          mocks.numberOpts = opts2;
          if (mocks.dialNumberThrows) throw new Error("dial");
        },
      };
    }
    say(_text: string) {
      this.said = true;
    }
    hangup() {
      this.hungUp = true;
    }
    toString() {
      if (this.said || this.hungUp) {
        return `<Response>${this.said ? "<Say/>" : ""}${this.hungUp ? "<Hangup/>" : ""}</Response>`;
      }
      return "<Response/>";
    }
  }
  return { default: { Twilio: TwilioClient, twiml: { VoiceResponse } } };
});

describe("app/routes/api+/dial/route.$number.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.dialNumberThrows = false;
    requireTwilioSignatureMock.mockClear();
    requireTwilioSignatureMock.mockResolvedValue(null);
    findCallBySidMock.mockClear();
    findCallBySidMock.mockResolvedValue(null);
  });

  // Regression: this route used to build the signature-check option as
  // `callSid ? { callSid } : {}` — omitting CallSid silently downgraded
  // validation to the main-account token instead of failing. Twilio always
  // supplies CallSid when fetching a call's TwiML action URL.
  test("rejects with 403 hangup when CallSid is missing, without calling requireTwilioSignature", async () => {
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
      params: { number: "+15550001111" },
    } as any));
    expect(res.status).toBe(403);
    expect(requireTwilioSignatureMock).not.toHaveBeenCalled();
  });

  test("returns xml with dial using absolute status callback", async () => {
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
      params: { number: "+15550001111" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    await expect(res.text()).resolves.toContain("<Response");
    expect(mocks.numberOpts).toMatchObject({
      statusCallback: "https://base.example/api/call-status/",
    });
  }, 30000);

  test("logs and returns fallback TwiML (not an HTML error page) when twiml building throws", async () => {
    mocks.dialNumberThrows = true;
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
        params: { number: "+15550001111" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("<Say");
    expect(body).toContain("<Hangup");
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in dial route:", expect.any(Error));
  }, 30000);
});

