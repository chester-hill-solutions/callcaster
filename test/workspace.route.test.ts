import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    requireWorkspaceAccess: vi.fn(async () => undefined),
    getWorkspaceById: vi.fn(),
    mergeWorkspaceTwilioData: vi.fn(),
    env: {
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: mocks.safeParseJson,
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: mocks.getWorkspaceById,
  mergeWorkspaceTwilioData: mocks.mergeWorkspaceTwilioData,
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/api-auth.server", () => ({
  getDualAuthUser: (auth: any) => auth,
  requireDualAuth: vi.fn(async () => ({ user: { id: "u1" } })),
}));

describe("app/routes/api+/workspace/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getWorkspaceById.mockReset();
    mocks.mergeWorkspaceTwilioData.mockReset();
    mocks.env.BETTER_AUTH_URL.mockClear();
    mocks.env.BETTER_AUTH_SERVICE_KEY.mockClear();
    mocks.logger.error.mockReset();
  });

  test("returns 200 with updated row", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w1", update: {} });
    mocks.getWorkspaceById.mockResolvedValueOnce({ id: "w1", twilio_data: {} });
    mocks.mergeWorkspaceTwilioData.mockResolvedValueOnce({ id: "w1", twilio_data: {} });
    queueDualAuthSession({
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/workspace");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "w1", twilio_data: {} });
    expect(mocks.getWorkspaceById).toHaveBeenCalledWith("w1");
  });

  test("returns 500 and logs when update throws", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w2", update: { name: "New" } });
    mocks.getWorkspaceById.mockResolvedValueOnce({ id: "w2", twilio_data: {} });
    mocks.mergeWorkspaceTwilioData.mockRejectedValueOnce(new Error("bad"));
    queueDualAuthSession({
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/workspace");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Subaccount failed",
      expect.anything(),
    );
  });
});
