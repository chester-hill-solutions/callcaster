import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const railwayKeys = ["RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_DEPLOYMENT_ID"] as const;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ENV", "local");
  vi.stubEnv("NODE_ENV", "test");
  for (const key of railwayKeys) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("server checkout provider", () => {
  test("an ordinary local process uses mock checkout", async () => {
    const runtime = await import("../config/server-runtime");
    expect(runtime.serverProjectConfig.environment).toBe("local");
    expect(runtime.checkoutProvider).toBe("mock");
  });

  test.each(["dev", "qa", "production"])("%s uses Stripe", async (environment) => {
    vi.stubEnv("ENV", environment);
    expect((await import("../config/server-runtime")).checkoutProvider).toBe("stripe");
  });

  test.each(railwayKeys)("%s forces Stripe even when ENV says local", async (key) => {
    vi.stubEnv(key, "fixture-identity");
    const runtime = await import("../config/server-runtime");
    expect(runtime.serverProjectConfig.environment).toBe("production");
    expect(runtime.checkoutProvider).toBe("stripe");
  });

  test("a production server refuses the local mock selection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await import("../config/server-runtime")).checkoutProvider).toBe("stripe");
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
