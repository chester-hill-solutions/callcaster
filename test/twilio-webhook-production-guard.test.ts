import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("shouldValidateTwilioWebhooks production guard", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllEnvs();
  });

  test("forces validation on in production even when TWILIO_VALIDATE_WEBHOOKS=false", async () => {
    process.env.NODE_ENV = "production";
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "false");

    const { shouldValidateTwilioWebhooks } = await import("@/twilio.server");
    expect(shouldValidateTwilioWebhooks()).toBe(true);
  });

  test("allows bypass in non-production when TWILIO_VALIDATE_WEBHOOKS=false", async () => {
    process.env.NODE_ENV = "development";
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "false");

    const { shouldValidateTwilioWebhooks } = await import("@/twilio.server");
    expect(shouldValidateTwilioWebhooks()).toBe(false);
  });
});
