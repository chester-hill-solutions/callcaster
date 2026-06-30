import { afterEach, describe, expect, test, vi } from "vitest";

function seedRequiredEnv() {
  process.env.NODE_ENV = "test";
  process.env.BASE_URL = "http://localhost";
  process.env.BETTER_AUTH_SECRET = "a";
  process.env.BETTER_AUTH_SECRET = "b";
  process.env.BASE_URL = "c";
  process.env.TWILIO_SID = "d";
  process.env.TWILIO_AUTH_TOKEN = "e";
  process.env.TWILIO_APP_SID = "f";
  process.env.TWILIO_PHONE_NUMBER = "+15555550100";
  process.env.BASE_URL = "http://localhost";
  process.env.STRIPE_SECRET_KEY = "sk";
  process.env.RESEND_API_KEY = "re";
}

describe("env.server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    seedRequiredEnv();
  });

  test("required env getters throw when missing", async () => {
    vi.resetModules();
    delete process.env.BASE_URL;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const mod = await import("../app/lib/env.server");
      expect(() => mod.env.BASE_URL()).toThrow(
        /Missing required environment variable: AUTH_URL/,
      );
    } finally {
      err.mockRestore();
    }
  });

  test("optional env getter returns undefined when missing", async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    seedRequiredEnv();

    const mod = await import("../app/lib/env.server");
    expect(mod.env.OPENAI_API_KEY()).toBeUndefined();
    expect(mod.env.STRIPE_WEBHOOK_SECRET()).toBeUndefined();
  });

  test("server import logs validation errors instead of throwing", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    delete process.env.BASE_URL;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../app/lib/env.server")).resolves.toBeDefined();
    expect(err).toHaveBeenCalled();

    err.mockRestore();
  });

  test("revalidateEnv throws when any required is missing", async () => {
    vi.resetModules();
    // Set everything except TWILIO_AUTH_TOKEN.
    seedRequiredEnv();
    delete process.env.TWILIO_AUTH_TOKEN;

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const mod = await import("../app/lib/env.server");
      expect(() => mod.revalidateEnv()).toThrow(
        /Missing required environment variables: .*TWILIO_AUTH_TOKEN/,
      );
    } finally {
      err.mockRestore();
    }
  });

  test("all getters return values when present and revalidateEnv passes", async () => {
    vi.resetModules();
    seedRequiredEnv();
    process.env.OPENAI_API_KEY = "oa";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_1";
    process.env.VERIFICATION_PHONE_NUMBER = "+15551234567";

    const mod = await import("../app/lib/env.server");

    expect(mod.env.BASE_URL()).toBe("http://localhost");
    expect(mod.env.BASE_URL()).toBe("a");
    expect(mod.env.BASE_URL()).toBe("b");
    expect(mod.env.BASE_URL()).toBe("c");
    expect(mod.env.TWILIO_SID()).toBe("d");
    expect(mod.env.TWILIO_AUTH_TOKEN()).toBe("e");
    expect(mod.env.TWILIO_APP_SID()).toBe("f");
    expect(mod.env.TWILIO_PHONE_NUMBER()).toBe("+15555550100");
    expect(mod.env.BASE_URL()).toBe("http://localhost");
    expect(mod.env.STRIPE_SECRET_KEY()).toBe("sk");
    expect(mod.env.RESEND_API_KEY()).toBe("re");
    expect(mod.env.OPENAI_API_KEY()).toBe("oa");
    expect(mod.env.STRIPE_WEBHOOK_SECRET()).toBe("whsec_1");
    expect(mod.env.VERIFICATION_PHONE_NUMBER()).toBe("+15551234567");

    expect(() => mod.revalidateEnv()).not.toThrow();
  });

  test("does not validate environment on import when window exists", async () => {
    vi.resetModules();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", { location: { hostname: "example.com" } } as any);
    delete process.env.BASE_URL;

    await import("../app/lib/env.server");
    expect(err).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("verification phone getter throws when missing", async () => {
    vi.resetModules();
    seedRequiredEnv();
    delete process.env.VERIFICATION_PHONE_NUMBER;

    const mod = await import("../app/lib/env.server");
    expect(() => mod.env.VERIFICATION_PHONE_NUMBER()).toThrow(
      /Missing required environment variable: VERIFICATION_PHONE_NUMBER/,
    );
  });
});
