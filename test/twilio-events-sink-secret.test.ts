import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

async function loadGate() {
  const { requireTwilioEventsSinkSecret } = await import(
    "@/lib/twilio-webhook.server"
  );
  return requireTwilioEventsSinkSecret;
}

describe("requireTwilioEventsSinkSecret", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    // Force validation on regardless of the local .env.
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllEnvs();
  });

  test("rejects every request when TWILIO_EVENTS_SINK_SECRET is unset", async () => {
    vi.stubEnv("TWILIO_EVENTS_SINK_SECRET", "");
    const gate = await loadGate();

    const response = gate(
      new Request("https://example.com/api/twilio/a2p/events?token=anything"),
    );
    expect(response?.status).toBe(403);
  });

  test("rejects a wrong token", async () => {
    vi.stubEnv("TWILIO_EVENTS_SINK_SECRET", "correct-secret");
    const gate = await loadGate();

    const response = gate(
      new Request("https://example.com/api/twilio/a2p/events?token=wrong"),
    );
    expect(response?.status).toBe(403);
  });

  test("accepts the token as a query param", async () => {
    vi.stubEnv("TWILIO_EVENTS_SINK_SECRET", "correct-secret");
    const gate = await loadGate();

    const response = gate(
      new Request(
        "https://example.com/api/twilio/a2p/events?token=correct-secret",
      ),
    );
    expect(response).toBeNull();
  });

  test("accepts the token as the x-events-sink-secret header", async () => {
    vi.stubEnv("TWILIO_EVENTS_SINK_SECRET", "correct-secret");
    const gate = await loadGate();

    const response = gate(
      new Request("https://example.com/api/twilio/a2p/events", {
        headers: { "x-events-sink-secret": "correct-secret" },
      }),
    );
    expect(response).toBeNull();
  });

  test("skips the gate only when webhook validation is off outside production", async () => {
    process.env.NODE_ENV = "development";
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "false");
    vi.stubEnv("TWILIO_EVENTS_SINK_SECRET", "");
    const gate = await loadGate();

    const response = gate(
      new Request("https://example.com/api/twilio/a2p/events"),
    );
    expect(response).toBeNull();
  });
});
