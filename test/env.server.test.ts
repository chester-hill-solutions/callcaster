import { describe, expect, test, vi } from "vitest";

describe("env.server", () => {
  test("required env getters throw when missing", async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    const mod = await import("../app/lib/env.server");
    expect(() => mod.env.SUPABASE_URL()).toThrow(
      /Missing required environment variable: SUPABASE_URL/,
    );
  });

  test("optional env getter returns undefined when missing", async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_ANON_KEY = "a";
    process.env.SUPABASE_SERVICE_KEY = "b";
    process.env.SUPABASE_PUBLISHABLE_KEY = "c";
    process.env.TWILIO_SID = "d";
    process.env.TWILIO_AUTH_TOKEN = "e";
    process.env.TWILIO_APP_SID = "f";
    process.env.TWILIO_PHONE_NUMBER = "+15555550100";
    process.env.BASE_URL = "http://localhost";
    process.env.STRIPE_SECRET_KEY = "sk";
    process.env.RESEND_API_KEY = "re";

    const mod = await import("../app/lib/env.server");
    expect(mod.env.OPENAI_API_KEY()).toBeUndefined();
    expect(mod.env.STRIPE_WEBHOOK_SECRET()).toBeUndefined();
  });

  test("server import logs validation errors instead of throwing", async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../app/lib/env.server")).resolves.toBeDefined();
    expect(err).toHaveBeenCalled();

    err.mockRestore();
  });

  test("revalidateEnv throws when any required is missing", async () => {
    vi.resetModules();
    // Set everything except TWILIO_AUTH_TOKEN.
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_ANON_KEY = "a";
    process.env.SUPABASE_SERVICE_KEY = "b";
    process.env.SUPABASE_PUBLISHABLE_KEY = "c";
    process.env.TWILIO_SID = "d";
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_APP_SID = "f";
    process.env.TWILIO_PHONE_NUMBER = "+15555550100";
    process.env.BASE_URL = "http://localhost";
    process.env.STRIPE_SECRET_KEY = "sk";
    process.env.RESEND_API_KEY = "re";

    const mod = await import("../app/lib/env.server");
    expect(() => mod.revalidateEnv()).toThrow(
      /Missing required environment variables: .*TWILIO_AUTH_TOKEN/,
    );
  });

  test("all getters return values when present and revalidateEnv passes", async () => {
    vi.resetModules();
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_ANON_KEY = "a";
    process.env.SUPABASE_SERVICE_KEY = "b";
    process.env.SUPABASE_PUBLISHABLE_KEY = "c";
    process.env.TWILIO_SID = "d";
    process.env.TWILIO_AUTH_TOKEN = "e";
    process.env.TWILIO_APP_SID = "f";
    process.env.TWILIO_PHONE_NUMBER = "+15555550100";
    process.env.BASE_URL = "http://localhost";
    process.env.STRIPE_SECRET_KEY = "sk";
    process.env.RESEND_API_KEY = "re";
    process.env.OPENAI_API_KEY = "oa";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_1";
    process.env.VERIFICATION_PHONE_NUMBER = "+15551234567";

    const mod = await import("../app/lib/env.server");

    expect(mod.env.SUPABASE_URL()).toBe("http://localhost");
    expect(mod.env.SUPABASE_ANON_KEY()).toBe("a");
    expect(mod.env.SUPABASE_SERVICE_KEY()).toBe("b");
    expect(mod.env.SUPABASE_PUBLISHABLE_KEY()).toBe("c");
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
    delete process.env.SUPABASE_URL;

    await import("../app/lib/env.server");
    expect(err).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("verification phone getter throws when missing", async () => {
    vi.resetModules();
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_ANON_KEY = "a";
    process.env.SUPABASE_SERVICE_KEY = "b";
    process.env.SUPABASE_PUBLISHABLE_KEY = "c";
    process.env.TWILIO_SID = "d";
    process.env.TWILIO_AUTH_TOKEN = "e";
    process.env.TWILIO_APP_SID = "f";
    process.env.TWILIO_PHONE_NUMBER = "+15555550100";
    process.env.BASE_URL = "http://localhost";
    process.env.STRIPE_SECRET_KEY = "sk";
    process.env.RESEND_API_KEY = "re";
    delete process.env.VERIFICATION_PHONE_NUMBER;

    const mod = await import("../app/lib/env.server");
    expect(() => mod.env.VERIFICATION_PHONE_NUMBER()).toThrow(
      /Missing required environment variable: VERIFICATION_PHONE_NUMBER/,
    );
  });
});
