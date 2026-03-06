import { describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const twilioMocks = vi.hoisted(() => {
  return {
    validateRequest: vi.fn<
      (
        authToken: string,
        signature: string,
        url: string,
        params: Record<string, string>,
      ) => boolean
    >(),
    messagesCreate: vi.fn(async (req: any) => ({ sid: "SM_TEST", ...req })),
  };
});

vi.mock("twilio", () => {
  class TwilioClientMock {
    messages = { create: twilioMocks.messagesCreate };
  }
  return {
    default: {
      validateRequest: twilioMocks.validateRequest,
      Twilio: TwilioClientMock,
    },
  };
});

import { sendSms, singleton, validateTwilioWebhook, validateTwilioWebhookParams } from "@/twilio.server";

describe("Twilio webhook validation", () => {
  test("rejects when x-twilio-signature is missing", async () => {
    const fd = new FormData();
    fd.set("CallSid", "CA123");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      body: fd,
    });

    const res = await validateTwilioWebhook(req, "token");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    await expect((res as Response).json()).resolves.toMatchObject({
      error: "Missing Twilio signature",
    });
  });

  test("rejects when signature is invalid", async () => {
    twilioMocks.validateRequest.mockReturnValueOnce(false);
    const fd = new FormData();
    fd.set("CallSid", "CA123");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      headers: { "x-twilio-signature": "bad" },
      body: fd,
    });

    const res = await validateTwilioWebhook(req, "token");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    await expect((res as Response).json()).resolves.toMatchObject({
      error: "Invalid Twilio signature",
    });
  });

  test("returns parsed params when signature is valid", async () => {
    twilioMocks.validateRequest.mockReturnValueOnce(true);
    const fd = new FormData();
    fd.set("SmsSid", "SM123");
    fd.set("SmsStatus", "delivered");
    const req = new Request("http://localhost/api/sms/status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    const res = await validateTwilioWebhook(req, "token");
    expect(res).not.toBeInstanceOf(Response);
    expect(res).toMatchObject({
      params: { SmsSid: "SM123", SmsStatus: "delivered" },
    });
  });

  test("validateTwilioWebhookParams returns false when signature is missing", () => {
    const ok = validateTwilioWebhookParams({ a: "1" }, null, "http://localhost/x", "token");
    expect(ok).toBe(false);
  });

  test("validateTwilioWebhookParams delegates to Twilio.validateRequest when signature present", () => {
    twilioMocks.validateRequest.mockReturnValueOnce(true);
    const ok = validateTwilioWebhookParams(
      { a: "1" },
      "sig",
      "http://localhost/x",
      "token",
    );
    expect(ok).toBe(true);
    expect(twilioMocks.validateRequest).toHaveBeenCalledWith(
      "token",
      "sig",
      "http://localhost/x",
      { a: "1" },
    );
  });

  test("sendSms uses twilio.messages.create", async () => {
    const res = await sendSms({ from: "+15550001", to: "+15550002", body: "hi" });
    expect(twilioMocks.messagesCreate).toHaveBeenCalledWith({
      from: "+15550001",
      to: "+15550002",
      body: "hi",
    });
    expect(res).toMatchObject({ sid: "SM_TEST" });
  });

  test("singleton caches a value by name", () => {
    const factory = vi.fn(() => ({ ok: true }));
    const a = singleton("test-singleton", factory);
    const b = singleton("test-singleton", factory);
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

