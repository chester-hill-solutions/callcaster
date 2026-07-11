import { describe, expect, test, vi } from "vitest";

// React Router 8 requires route `middleware` exports to be arrays of
// middleware functions. A bare function passes typecheck in the re-export
// shims and works in unit tests (which call loaders directly), but crashes
// the router pipeline at runtime: "m.route.middleware.map is not a function".
// These shims are the only three middleware mount points.

vi.mock("@/lib/workspace-middleware.server", () => ({
  workspaceMiddleware: vi.fn(),
}));
vi.mock("@/lib/data-plane-middleware.server", () => ({
  dataPlaneMiddleware: vi.fn(),
}));
vi.mock("@/lib/admin-middleware.server", () => ({
  adminMiddleware: vi.fn(),
}));

describe("route middleware exports", () => {
  test.each([
    ["workspace", () => import("../app/routes/workspaces+/$id.middleware.server")],
    [
      "data-plane",
      () => import("../app/routes/api+/workspaces+/$workspaceId.middleware.server"),
    ],
    ["admin", () => import("../app/routes/admin+/route.middleware.server")],
  ])("%s middleware export is an array of functions", async (_name, load) => {
    const mod = await load();
    expect(Array.isArray(mod.middleware)).toBe(true);
    expect(mod.middleware.length).toBeGreaterThan(0);
    for (const fn of mod.middleware) {
      expect(typeof fn).toBe("function");
    }
  });
});
