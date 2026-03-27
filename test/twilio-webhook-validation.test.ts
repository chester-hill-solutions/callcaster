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

vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { sendSms, singleton, validateTwilioWebhook, validateTwilioWebhookParams } from "@/twilio.server";

describe("Twilio webhook validation", () => {
  test("validateTwilioWebhook parses form body (signature check stubbed)", async () => {
    const fd = new FormData();
    fd.set("CallSid", "CA123");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      body: fd,
    });

    const res = await validateTwilioWebhook(req, "token");
    expect(res).toMatchObject({ params: { CallSid: "CA123" } });
  });

  test("validateTwilioWebhook parses body when signature header present (stubbed)", async () => {
    twilioMocks.validateRequest.mockReturnValueOnce(false);
    const fd = new FormData();
    fd.set("CallSid", "CA123");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      headers: { "x-twilio-signature": "bad" },
      body: fd,
    });

    const res = await validateTwilioWebhook(req, "token");
    expect(res).toMatchObject({ params: { CallSid: "CA123" } });
  });

  test("returns parsed params for sms status shape", async () => {
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
    expect(res).toMatchObject({
      params: { SmsSid: "SM123", SmsStatus: "delivered" },
    });
  });

  test("validateTwilioWebhookParams returns true (signature validation stubbed)", () => {
    const ok = validateTwilioWebhookParams({ a: "1" }, null, "http://localhost/x", "token");
    expect(ok).toBe(true);
  });

  test("validateTwilioWebhookParams returns true when signature present (stubbed)", () => {
    twilioMocks.validateRequest.mockReturnValueOnce(true);
    const ok = validateTwilioWebhookParams(
      { a: "1" },
      "sig",
      "http://localhost/x",
      "token",
    );
    expect(ok).toBe(true);
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

  test("singleton caches factory result", () => {
    let count = 0;
    const value = singleton("test-key", () => {
      count += 1;
      return { count };
    });
    expect(value).toEqual({ count: 1 });
    expect(singleton("test-key", () => ({ count: 99 }))).toBe(value);
    expect(count).toBe(1);
  });
});
