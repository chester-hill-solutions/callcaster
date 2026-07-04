import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const hangup = vi.fn();
  const toString = vi.fn(() => "<Response />");
  const VoiceResponse = vi.fn(function (this: unknown) {
    return { say, hangup, toString };
  });
  return {
    env: {
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    VoiceResponse,
    say,
    hangup,
    toString,
  };
});

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("twilio", () => ({
  default: { twiml: { VoiceResponse: mocks.VoiceResponse } },
}));

const verificationDbMocks = vi.hoisted(() => ({
  findPendingVerificationSession: vi.fn(),
  getUserVerifiedAudioNumbers: vi.fn(),
  appendVerifiedAudioNumber: vi.fn(),
  markVerificationSessionVerified: vi.fn(),
}));

vi.mock("@/lib/verification-db.server", () => ({
  findPendingVerificationSession: (...args: unknown[]) =>
    verificationDbMocks.findPendingVerificationSession(...args),
  getUserVerifiedAudioNumbers: (...args: unknown[]) =>
    verificationDbMocks.getUserVerifiedAudioNumbers(...args),
  appendVerifiedAudioNumber: (...args: unknown[]) =>
    verificationDbMocks.appendVerifiedAudioNumber(...args),
  markVerificationSessionVerified: (...args: unknown[]) =>
    verificationDbMocks.markVerificationSessionVerified(...args),
}));

describe("app/routes/api+/inbound/route-verification.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.VoiceResponse.mockClear();
    mocks.say.mockReset();
    mocks.hangup.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
    verificationDbMocks.findPendingVerificationSession.mockReset();
    verificationDbMocks.getUserVerifiedAudioNumbers.mockReset();
    verificationDbMocks.appendVerifiedAudioNumber.mockReset();
    verificationDbMocks.markVerificationSessionVerified.mockReset();
  });

  test("action returns error TwiML when From missing", async () => {
    const formData = new FormData();
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.say).toHaveBeenCalledWith(
      "Invalid request. Missing caller information."
    );
  });

  test("action returns error TwiML when no matching session", async () => {
    verificationDbMocks.findPendingVerificationSession.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));
    expect(mocks.say).toHaveBeenCalledWith(
      expect.stringContaining("No active verification session")
    );
  });

  test("action success updates user and returns success TwiML", async () => {
    verificationDbMocks.findPendingVerificationSession.mockResolvedValueOnce({
      id: "vs-1",
      user_id: "u1",
      expected_caller: "+15551234567",
    });
    verificationDbMocks.getUserVerifiedAudioNumbers.mockResolvedValueOnce([]);
    verificationDbMocks.appendVerifiedAudioNumber.mockResolvedValueOnce(undefined);
    verificationDbMocks.markVerificationSessionVerified.mockResolvedValueOnce(undefined);

    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.say).toHaveBeenCalledWith(
      "Your phone number has been successfully verified. You may now hang up."
    );
    expect(verificationDbMocks.appendVerifiedAudioNumber).toHaveBeenCalledWith("u1", "+15551234567");
    expect(verificationDbMocks.markVerificationSessionVerified).toHaveBeenCalledWith("vs-1");
  });

  test("action handles already-verified number", async () => {
    verificationDbMocks.findPendingVerificationSession.mockResolvedValueOnce({
      id: "vs-1",
      user_id: "u1",
      expected_caller: "+15551234567",
    });
    verificationDbMocks.getUserVerifiedAudioNumbers.mockResolvedValueOnce(["+15551234567"]);
    verificationDbMocks.markVerificationSessionVerified.mockResolvedValueOnce(undefined);

    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));

    expect(mocks.say).toHaveBeenCalledWith(
      "This number is already verified."
    );
    expect(verificationDbMocks.markVerificationSessionVerified).toHaveBeenCalledWith("vs-1");
  });
});
