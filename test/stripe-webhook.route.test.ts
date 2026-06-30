import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.mock("@/lib/env.server", () => ({
  env: {
    STRIPE_SECRET_KEY: () => "sk_test",
    STRIPE_WEBHOOK_SECRET: () => "",
    BETTER_AUTH_URL: () => "http://adminDb.test",
    BETTER_AUTH_SERVICE_KEY: () => "service-key",
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("app/routes/api+/stripe-webhook/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns 503 when webhook secret is not configured", async () => {
    const mod = await import("../app/routes/api+/stripe-webhook");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/stripe-webhook", {
          method: "POST",
          body: "{}",
        }),
      } as never),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("not configured");
  });
});
