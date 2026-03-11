import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const pause = vi.fn();
  const gather = vi.fn();
  const toString = vi.fn(() => "<Response />");

  const VoiceResponse = vi.fn(function (this: any) {
    return { say, pause, gather, toString };
  });

  return { say, pause, gather, toString, VoiceResponse };
});

vi.mock("twilio", () => ({
  default: {
    twiml: {
      VoiceResponse: mocks.VoiceResponse,
    },
  },
}));

describe("app/routes/api.verify-audio-pin.$pin.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.say.mockReset();
    mocks.pause.mockReset();
    mocks.gather.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
    mocks.VoiceResponse.mockClear();
  });

  test("loader returns TwiML with gather action using BASE_URL", async () => {
    const prev = process.env.BASE_URL;
    process.env.BASE_URL = "http://base";

    const mod = await import("../app/routes/api.verify-audio-pin.$pin");
    const res = await mod.loader();

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toBe("<Response />");
    expect(mocks.gather).toHaveBeenCalledWith(
      expect.objectContaining({
        numDigits: 6,
        action: "http://base/api/verify-pin-input",
        method: "POST",
        timeout: 30,
      })
    );

    process.env.BASE_URL = prev;
  });
});

