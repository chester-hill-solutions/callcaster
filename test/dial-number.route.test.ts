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
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: vi.fn(async () => null),
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
  });

  test("returns xml with dial using absolute status callback", async () => {
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    const res = await asRouteResponse(await mod.action({
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
    const res = await asRouteResponse(
      await mod.action({
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

