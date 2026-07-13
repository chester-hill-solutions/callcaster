import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const pause = vi.fn();
  const gather = vi.fn();
  const toString = vi.fn(() => "<Response />");
  const VoiceResponse = vi.fn(function (this: any) {
    return { say, pause, gather, toString };
  });

  return {
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    env: {
      BASE_URL: vi.fn(() => "http://base"),
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_PUBLISHABLE_KEY: vi.fn(() => "publishable"),
      BETTER_AUTH_SERVICE_KEY: vi.fn(() => "service-key"),
    },
    VoiceResponse,
    say,
    pause,
    gather,
    toString,
  };
});

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers({ "Set-Cookie": "a=1" }) }),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("twilio", () => ({
  default: { twiml: { VoiceResponse: mocks.VoiceResponse } },
}));

describe("app/routes/api+/verify-audio-session/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.env.BASE_URL.mockClear();
    mocks.VoiceResponse.mockClear();
    mocks.say.mockReset();
    mocks.pause.mockReset();
    mocks.gather.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
  });

  test("loader returns retired 410 response", async () => {
    const mod = await import("../app/routes/api+/verify-audio-session");
    const res = await asRouteResponse(mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any));
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({
      error: "Audio PIN verification has been retired. Use call-in verification instead.",
    });
  });

  test("action returns TwiML xml", async () => {
    const mod = await import("../app/routes/api+/verify-audio-session");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toBe("<Response />");
    expect(mocks.gather).toHaveBeenCalledWith(
      expect.objectContaining({
        numDigits: 6,
        action: "http://base/api/verify-pin-input",
        method: "POST",
        timeout: 30,
      }),
    );
  });
});
