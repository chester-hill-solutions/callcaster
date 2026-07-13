import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => ({
  listWorkspaceAuditEventsApi: vi.fn(),
}));

vi.mock("@/lib/platform-audit.server", () => ({
  listWorkspaceAuditEventsApi: (...args: unknown[]) =>
    mocks.listWorkspaceAuditEventsApi(...args),
}));

describe("app/routes/api+/workspaces/$workspaceId/audit-events/route.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns audit events for owner session", async () => {
    mocks.listWorkspaceAuditEventsApi.mockResolvedValueOnce({
      ok: true,
      events: [{ id: 1, action: "calls.disconnect" }],
      next_cursor: null,
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const response = await asRouteResponse(
      await mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/w1/audit-events"),
          params: { workspaceId: "w1" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [{ id: 1, action: "calls.disconnect" }],
      next_cursor: null,
    });
    expect(mocks.listWorkspaceAuditEventsApi).toHaveBeenCalledWith(
      "user-1",
      "w1",
      expect.any(URLSearchParams),
    );
  });

  test("returns 403 when platform audit rejects API key auth", async () => {
    mocks.listWorkspaceAuditEventsApi.mockResolvedValueOnce({
      ok: false,
      error: "Audit log access requires a signed-in owner session",
      status: 403,
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const response = await asRouteResponse(
      await mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request("http://localhost/api/workspaces/w1/audit-events"),
            params: { workspaceId: "w1" },
          },
          { userId: null },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Audit log access requires a signed-in owner session",
    });
  });
});
