import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  listWorkspaceAuditEventsApi: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

vi.mock("@/lib/platform-audit.server", () => ({
  listWorkspaceAuditEventsApi: (...args: unknown[]) =>
    mocks.listWorkspaceAuditEventsApi(...args),
}));

describe("app/routes/api+/workspaces/$workspaceId/audit-events/route.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
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
    const response = await asRouteResponse(mod.loader(
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

  test("propagates listWorkspaceAuditEventsApi errors after capability gate", async () => {
    mocks.listWorkspaceAuditEventsApi.mockResolvedValueOnce({
      ok: false,
      error: "Invalid cursor",
      status: 400,
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const response = await asRouteResponse(mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/audit-events?cursor=bad",
          ),
          params: { workspaceId: "w1" },
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid cursor",
    });
  });
});
