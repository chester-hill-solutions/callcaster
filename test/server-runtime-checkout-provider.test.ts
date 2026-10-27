import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("server checkout provider", () => {
  test("Railway identity forces production even when ENV says local", async () => {
    vi.resetModules();
    vi.stubEnv("ENV", "local");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RAILWAY_SERVICE_ID", "service-id");

    const runtime = await import("../config/server-runtime");

    expect(runtime.serverProjectConfig.environment).toBe("production");
    expect(runtime.checkoutProvider).toBe("stripe");
  });

  test("rejects a non-local mock configuration", async () => {
    const { parseProjectConfig } = await import("../config/schema");
    const { baseProjectConfig } = await import("../config/base");

    expect(() => parseProjectConfig({
      ...baseProjectConfig,
      environment: "qa",
      services: { ...baseProjectConfig.services, app: { ...baseProjectConfig.services.app, checkoutProvider: "mock" } },
    })).toThrow(/only valid for local/);
  });
});
