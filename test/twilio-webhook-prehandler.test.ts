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

describe("handleTwilioWebhookRequest", () => {
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
