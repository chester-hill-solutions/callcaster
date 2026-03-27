import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/openapi", () => ({ openApiSpec: { openapi: "3.0.0", info: { title: "t" } } }));

describe("app/routes/api.docs.openapi.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("returns 405 when method not GET", async () => {
    const mod = await import("../app/routing/api/api.docs.openapi");
    const res = await mod.loader({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(405);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  test("returns spec and cache headers on GET", async () => {
    const mod = await import("../app/routing/api/api.docs.openapi");
    const res = await mod.loader({ request: new Request("http://x", { method: "GET" }) } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(res.json()).resolves.toMatchObject({ openapi: "3.0.0" });
  });
});

