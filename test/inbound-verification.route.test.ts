import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    env: {
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  };
});

const twilioWebhookMocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(async () => null),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    twilioWebhookMocks.requireTwilioSignature(...args),
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

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
    twilioWebhookMocks.requireTwilioSignature.mockReset();
    twilioWebhookMocks.requireTwilioSignature.mockResolvedValue(null);
    verificationDbMocks.findPendingVerificationSession.mockReset();
    verificationDbMocks.getUserVerifiedAudioNumbers.mockReset();
    verificationDbMocks.appendVerifiedAudioNumber.mockReset();
    verificationDbMocks.markVerificationSessionVerified.mockReset();
  });

  test("action rejects requests with invalid Twilio signature", async () => {
    twilioWebhookMocks.requireTwilioSignature.mockResolvedValueOnce(
      new Response("<Response><Hangup/></Response>", {
        status: 403,
        headers: { "Content-Type": "text/xml" },
      }),
    );

    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));

    expect(res.status).toBe(403);
    expect(verificationDbMocks.findPendingVerificationSession).not.toHaveBeenCalled();
  });

  test("action returns error TwiML when From missing", async () => {
    const formData = new FormData();
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("<Say>Invalid request. Missing caller information.</Say>");
  });

  test("action returns error TwiML when no matching session", async () => {
    verificationDbMocks.findPendingVerificationSession.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api+/inbound-verification");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));
    const body = await res.text();
    expect(body).toContain("No active verification session");
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
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain(
      "<Say>Your phone number has been successfully verified. You may now hang up.</Say>",
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
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never));

    const body = await res.text();
    expect(body).toContain("<Say>This number is already verified.</Say>");
    expect(verificationDbMocks.markVerificationSessionVerified).toHaveBeenCalledWith("vs-1");
  });
});
