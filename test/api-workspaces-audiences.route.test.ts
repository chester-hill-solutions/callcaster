import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => ({
  listWorkspaceAudiencesApi: vi.fn(),
  getUserRole: vi.fn(),
}));

vi.mock("@/lib/platform-data.server", () => ({
  listWorkspaceAudiencesApi: (...args: unknown[]) =>
    mocks.listWorkspaceAudiencesApi(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

describe("app/routes/api+/workspaces/$workspaceId/audiences/route.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserRole.mockResolvedValue({ role: "member" });
  });

  test("lists audiences for an authorized workspace", async () => {
    mocks.listWorkspaceAudiencesApi.mockResolvedValueOnce({
      ok: true,
      audiences: [{ id: 1, name: "Main" }],
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audiences.route"
    );
    const response = await asRouteResponse(mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/w1/audiences"),
          params: { workspaceId: "w1" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      audiences: [{ id: 1, name: "Main" }],
    });
  });

  test("allows API key context without userId", async () => {
    mocks.listWorkspaceAudiencesApi.mockResolvedValueOnce({
      ok: true,
      audiences: [],
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audiences.route"
    );
    const response = await asRouteResponse(mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request("http://localhost/api/workspaces/w1/audiences"),
            params: { workspaceId: "w1" },
          },
          {
            userId: null,
            apiKey: { keyId: "k1", scopes: ["campaigns.read"] },
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.listWorkspaceAudiencesApi).toHaveBeenCalledWith("w1");
  });
});
