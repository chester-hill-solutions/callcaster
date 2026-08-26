import { describe, expect, mock, test } from "bun:test";

const loggerError = mock(() => {});
const requireTwilioSignature = mock(async () => null);

mock.module("../app/lib/logger.server.ts", () => ({
  logger: {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: loggerError,
  },
}));

mock.module("../app/lib/twilio-webhook.server.ts", () => ({
  requireTwilioSignature,
}));

const { handleTwilioWebhookRequest } = await import("../server/twilio-webhook.ts");
const { isTwilioWebhookPath } = await import("../server/twilio-webhook-paths.ts");

describe("handleTwilioWebhookRequest", () => {
  test("does not classify session API routes as Twilio webhooks", () => {
    expect(isTwilioWebhookPath("/api/dial")).toBe(false);
    expect(isTwilioWebhookPath("/api/ivr")).toBe(false);
    expect(isTwilioWebhookPath("/api/caller-id")).toBe(false);
    expect(isTwilioWebhookPath("/api/auto-dial/end")).toBe(false);
    expect(isTwilioWebhookPath("/api/call-status-poll")).toBe(false);
    expect(isTwilioWebhookPath("/api/inbound-queue")).toBe(false);
    expect(isTwilioWebhookPath("/api/twilio/a2p/events")).toBe(false);

    expect(isTwilioWebhookPath("/api/dial/status")).toBe(true);
    expect(isTwilioWebhookPath("/api/ivr/status")).toBe(true);
    expect(isTwilioWebhookPath("/api/inbound-sms")).toBe(true);
    expect(isTwilioWebhookPath("/api/auto-dial/room-1")).toBe(true);
  });

  test("continues without consuming body for non-webhook API routes", async () => {
    requireTwilioSignature.mockClear();
    const request = new Request("http://localhost:3000/api/dial", {
      method: "POST",
      body: new URLSearchParams({ workspace_id: "w1" }),
    });

    const result = await handleTwilioWebhookRequest(request);
    expect(result.kind).toBe("continue");
    expect(requireTwilioSignature).not.toHaveBeenCalled();
    expect(await request.formData()).toBeInstanceOf(FormData);
  });

  test("leaves A2P JSON events for the route handler", async () => {
    requireTwilioSignature.mockClear();
    const request = new Request("http://localhost:3000/api/twilio/a2p/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "com.twilio.messaging.compliance" }),
    });

    const result = await handleTwilioWebhookRequest(request);
    expect(result.kind).toBe("continue");
    expect(requireTwilioSignature).not.toHaveBeenCalled();
    expect(await request.json()).toEqual({
      type: "com.twilio.messaging.compliance",
    });
  });

  test("passes parsed params and a fresh body for real webhooks", async () => {
    requireTwilioSignature.mockClear();
    requireTwilioSignature.mockImplementation(async () => null);

    const body = new URLSearchParams({ CallSid: "CA1", AccountSid: "AC1" }).toString();
    const request = new Request("http://localhost:3000/api/ivr/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = await handleTwilioWebhookRequest(request);
    expect(result.kind).toBe("validated");
    expect(requireTwilioSignature).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        callSid: "CA1",
        params: expect.objectContaining({ CallSid: "CA1", AccountSid: "AC1" }),
      }),
    );
    if (result.kind !== "validated") return;
    expect(Object.fromEntries(await result.request.formData())).toEqual({
      CallSid: "CA1",
      AccountSid: "AC1",
    });
  });

  test("documents Bun clone-after-consume body behavior", async () => {
    const body = new URLSearchParams({ CallSid: "CA1" }).toString();
    const request = new Request("http://localhost:3000/api/ivr/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    expect(Object.fromEntries(await request.formData())).toEqual({ CallSid: "CA1" });
    // Bun's clone-after-consume contract changed across versions: older
    // releases replay an empty body from the consumed clone, newer ones
    // throw synchronously at clone(). The invariant under test is that a
    // consumed body is never re-served.
    let replay: Record<string, string> | null = null;
    try {
      replay = Object.fromEntries(await request.clone().formData());
    } catch {
      replay = null;
    }
    expect(replay === null || Object.keys(replay).length === 0).toBe(true);
  });

  test("logs and returns 403 hangup when prehandler throws", async () => {
    loggerError.mockClear();
    requireTwilioSignature.mockClear();
    requireTwilioSignature.mockImplementation(async () => {
      throw new Error("db down");
    });

    const body = new URLSearchParams({ CallSid: "CA1", AccountSid: "AC1" }).toString();
    const request = new Request("http://localhost:3000/api/ivr/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = await handleTwilioWebhookRequest(request);
    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.response.status).toBe(403);
    expect(result.response.headers.get("Content-Type")).toBe("text/xml");
    expect(loggerError).toHaveBeenCalled();
    const [event, details] = loggerError.mock.calls[0] ?? [];
    expect(event).toBe("twilio.webhook.prehandler_error");
    expect(details).toMatchObject({
      error: "db down",
      path: "/api/ivr/status",
    });
  });
});
