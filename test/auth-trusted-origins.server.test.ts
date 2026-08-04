import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@chester-hill-solutions/auth/origin", () => ({
  authTrustedOrigins: (fallback: string) => [fallback],
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => process.env.BETTER_AUTH_URL ?? process.env.BASE_URL,
    BASE_URL: () => process.env.BASE_URL ?? "http://localhost:3000",
  },
  isProduction: () => process.env.NODE_ENV === "production",
}));

describe("resolveAuthTrustedOrigins", () => {
  afterEach(() => {
    delete process.env.BASE_URL;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.APP_TRUSTED_ORIGINS;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.PORT;
    process.env.NODE_ENV = "test";
    vi.resetModules();
  });

  test("includes BASE_URL and loopback when not production", async () => {
    process.env.NODE_ENV = "development";
    process.env.BASE_URL = "https://abc123.loca.lt";
    const { resolveAuthTrustedOrigins } = await import(
      "@/lib/auth-trusted-origins.server"
    );

    const origins = await resolveAuthTrustedOrigins();
    expect(origins).toContain("https://abc123.loca.lt");
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://127.0.0.1:3000");
  });

  test("adds Host-derived origin so localhost signup works with tunnel BASE_URL", async () => {
    process.env.NODE_ENV = "development";
    process.env.BASE_URL = "https://abc123.loca.lt";
    const { resolveAuthTrustedOrigins } = await import(
      "@/lib/auth-trusted-origins.server"
    );

    const origins = await resolveAuthTrustedOrigins(
      new Headers({
        host: "localhost:3000",
        origin: "http://localhost:3000",
      }),
    );

    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("https://abc123.loca.lt");
  });

  test("honors forwarded host/proto on production", async () => {
    process.env.NODE_ENV = "production";
    process.env.BASE_URL = "https://callcaster.ca";
    const { resolveAuthTrustedOrigins } = await import(
      "@/lib/auth-trusted-origins.server"
    );

    const origins = await resolveAuthTrustedOrigins(
      new Headers({
        host: "callcaster-review.up.railway.app",
        "x-forwarded-host": "www.callcaster.ca",
        "x-forwarded-proto": "https",
      }),
    );

    expect(origins).toContain("https://callcaster.ca");
    expect(origins).toContain("https://www.callcaster.ca");
    expect(origins).not.toContain("http://localhost:3000");
  });

  test("merges APP_TRUSTED_ORIGINS and BETTER_AUTH_TRUSTED_ORIGINS", async () => {
    process.env.NODE_ENV = "production";
    process.env.BASE_URL = "https://callcaster.ca";
    process.env.APP_TRUSTED_ORIGINS = "https://www.callcaster.ca";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = "https://app.callcaster.ca";
    const { resolveStaticAuthTrustedOrigins } = await import(
      "@/lib/auth-trusted-origins.server"
    );

    const origins = resolveStaticAuthTrustedOrigins();
    expect(origins).toEqual(
      expect.arrayContaining([
        "https://callcaster.ca",
        "https://www.callcaster.ca",
        "https://app.callcaster.ca",
      ]),
    );
  });
});
