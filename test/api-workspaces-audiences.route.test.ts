import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => ({
  listWorkspaceAudiencesApi: vi.fn(),
  resolveDataPlaneAuth: vi.fn(),
}));

vi.mock("@/lib/platform-data.server", () => ({
  listWorkspaceAudiencesApi: (...args: unknown[]) =>
    mocks.listWorkspaceAudiencesApi(...args),
  resolveDataPlaneAuth: (...args: unknown[]) => mocks.resolveDataPlaneAuth(...args),
}));

vi.mock("@/lib/database.server", () => ({
  getUserRole: vi.fn(async () => ({ role: "admin" })),
}));

vi.mock("@/server/db", () => ({
  db: {},
}));

describe("app/routes/api+/workspaces/$workspaceId/audiences/route.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("lists audiences for an authorized workspace", async () => {
    mocks.resolveDataPlaneAuth.mockResolvedValueOnce({
      supabase: { from: vi.fn() },
      userId: "u1",
    });
    mocks.listWorkspaceAudiencesApi.mockResolvedValueOnce({
      ok: true,
      audiences: [{ id: 1, name: "Main" }],
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audiences.route"
    );
    const response = await asRouteResponse(
      await mod.loader({
        request: new Request("http://localhost/api/workspaces/w1/audiences"),
        params: { workspaceId: "w1" },
      } as never),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      audiences: [{ id: 1, name: "Main" }],
    });
  });

  test("returns 401 when auth fails", async () => {
    mocks.resolveDataPlaneAuth.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audiences.route"
    );
    const response = await asRouteResponse(
      await mod.loader({
        request: new Request("http://localhost/api/workspaces/w1/audiences"),
        params: { workspaceId: "w1" },
      } as never),
    );

    expect(response.status).toBe(401);
  });
});
