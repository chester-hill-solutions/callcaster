import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  startAutoDialConference: vi.fn(),
  getUserRole: vi.fn(),
}));

vi.mock("@/lib/auto-dial-start.server", () => ({
  startAutoDialConference: (...args: unknown[]) => mocks.startAutoDialConference(...args),
  autoDialCreditsErrorResponse: () =>
    new Response(JSON.stringify({ creditsError: true }), { status: 402 }),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

describe("dialer/start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserRole.mockResolvedValue({ role: "caller" });
    mocks.startAutoDialConference.mockResolvedValue({
      ok: true,
      conferenceName: "u1~abc",
    });
  });

  test("returns 403 when session user lacks caller role", async () => {
    mocks.getUserRole.mockResolvedValueOnce(null);

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.route"
    );
    const res = await asRouteResponse(mod.action(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/campaigns/1/dialer/start",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caller_id: "+1555",
                selected_device: "computer",
              }),
            },
          ),
          params: { workspaceId: "w1", campaignId: "1" },
        }),
      ),
    );

    expect(res.status).toBe(403);
  });

  test("starts conference for authorized caller", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.route"
    );
    const res = await asRouteResponse(mod.action(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/campaigns/1/dialer/start",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caller_id: "+1555",
                selected_device: "computer",
              }),
            },
          ),
          params: { workspaceId: "w1", campaignId: "1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      conferenceName: "u1~abc",
    });
    expect(mocks.startAutoDialConference).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "w1",
      campaignId: 1,
      callerId: "+1555",
      selectedDevice: "computer",
    });
  });
});
