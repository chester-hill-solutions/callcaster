import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.mock("@/lib/openapi-complete", () => ({
  completeOpenApiSpec: { openapi: "3.0.3", info: { title: "Complete" } },
}));

describe("app/routes/api+/docs/openapi/all.route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns 405 when method not GET", async () => {
    const mod = await import("../app/routes/api+/docs/openapi/all.route");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request("http://x", { method: "POST" }),
      } as never),
    );
    expect(res.status).toBe(405);
  });

  test("returns complete spec and cache headers on GET", async () => {
    const mod = await import("../app/routes/api+/docs/openapi/all.route");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request("http://x", { method: "GET" }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(res.json()).resolves.toMatchObject({
      openapi: "3.0.3",
      info: { title: "Complete" },
    });
  });
});
