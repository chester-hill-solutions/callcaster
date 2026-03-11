import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioMocks = vi.hoisted(() => {
  return {
    dialNumber: vi.fn(),
    say: vi.fn(),
    dial: vi.fn(),
    toString: vi.fn(() => "<Response/>"),
  };
});

vi.mock("twilio", () => {
  class VoiceResponse {
    dial(opts: any) {
      twilioMocks.dial(opts);
      return { number: twilioMocks.dialNumber };
    }
    say(text: string) {
      twilioMocks.say(text);
    }
    toString() {
      return twilioMocks.toString();
    }
  }

  return {
    default: {
      twiml: { VoiceResponse },
    },
  };
});

vi.mock("@/lib/env.server", () => {
  return {
    env: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "BASE_URL") return () => "https://base.example";
          if (prop === "TWILIO_PHONE_NUMBER") return () => "+15551234567";
          return () => "test";
        },
      },
    ),
  };
});

describe("app/routes/api.call.tsx", () => {
  beforeEach(() => {
    twilioMocks.dialNumber.mockReset();
    twilioMocks.say.mockReset();
    twilioMocks.dial.mockReset();
    twilioMocks.toString.mockClear();
    vi.resetModules();
  });

  test("action dials when To is phone-like", async () => {
    const mod = await import("../app/routes/api.call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    const res = await mod.action({
      request: new Request("http://localhost/api/call", { method: "POST", body: fd }),
    } as any);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    await res.text();
    expect(twilioMocks.dial).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: "+15551234567",
        record: "record-from-answer",
        recordingStatusCallback: "https://base.example/api/recording",
        transcribe: true,
        transcribeCallback: "https://base.example/api/transcribe",
      }),
    );
    expect(twilioMocks.dialNumber).toHaveBeenCalledWith("+15555550100");
    expect(twilioMocks.say).not.toHaveBeenCalled();
  });

  test("action says invalid when To contains invalid chars", async () => {
    const mod = await import("../app/routes/api.call");
    const fd = new FormData();
    fd.set("To", "not-a-phone");
    const res = await mod.action({
      request: new Request("http://localhost/api/call", { method: "POST", body: fd }),
    } as any);

    await res.text();
    expect(twilioMocks.say).toHaveBeenCalledWith("The provided phone number is invalid.");
    expect(twilioMocks.dial).not.toHaveBeenCalled();
  });
});

