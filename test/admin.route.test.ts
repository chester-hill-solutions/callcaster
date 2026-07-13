import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withAdminRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  syncWorkspaceTwilio: vi.fn(),
  toggleWorkspaceStatus: vi.fn(),
}));

vi.mock("@/lib/platform-admin.server", () => ({
  syncWorkspaceTwilio: (...args: unknown[]) => mocks.syncWorkspaceTwilio(...args),
  toggleWorkspaceStatus: (...args: unknown[]) => mocks.toggleWorkspaceStatus(...args),
  disableUser: vi.fn(),
  syncAllWorkspacesTwilio: vi.fn(),
  getAdminDashboard: vi.fn(),
}));

describe("app/routes/admin+.tsx action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.syncWorkspaceTwilio.mockReset();
    mocks.toggleWorkspaceStatus.mockReset();
  });

  test("sync_workspace_twilio runs direct sync helper", async () => {
    mocks.syncWorkspaceTwilio.mockResolvedValueOnce({ ok: true });

    const mod = await import("../app/routes/admin+/route");
    const formData = new FormData();
    formData.set("_action", "sync_workspace_twilio");
    formData.set("workspaceId", "w1");

    const res = await asRouteResponse(mod.action(
        await withAdminRouteArgs({
          request: new Request("http://x", { method: "POST", body: formData }),
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(mocks.syncWorkspaceTwilio).toHaveBeenCalledWith("w1");
  });

  test("toggle_workspace_status updates workspace disabled flag", async () => {
    mocks.toggleWorkspaceStatus.mockResolvedValueOnce({ ok: true });

    const mod = await import("../app/routes/admin+/route");
    const formData = new FormData();
    formData.set("_action", "toggle_workspace_status");
    formData.set("workspaceId", "w2");
    formData.set("currentStatus", "false");

    const res = await asRouteResponse(mod.action(
        await withAdminRouteArgs({
          request: new Request("http://x", { method: "POST", body: formData }),
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(mocks.toggleWorkspaceStatus).toHaveBeenCalledWith("w2", true);
  });
});
