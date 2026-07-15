import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJsonAuth: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  updateAgentStatus: vi.fn(),
  heartbeatAgentStatus: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/api-auth.server", () => ({
  requireJsonAuth: (...args: unknown[]) => mocks.requireJsonAuth(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/agent-status.server", () => ({
  updateAgentStatus: (...args: unknown[]) => mocks.updateAgentStatus(...args),
  heartbeatAgentStatus: (...args: unknown[]) =>
    mocks.heartbeatAgentStatus(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

import { asRouteResponse } from "./helpers/route-result";

describe("api+/agent-status.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireJsonAuth.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.updateAgentStatus.mockReset();
    mocks.heartbeatAgentStatus.mockReset();
    mocks.logger.error.mockReset();
    mocks.requireJsonAuth.mockResolvedValue({
      user: { id: "u1" },
      headers: new Headers(),
    });
    mocks.requireWorkspaceAccess.mockResolvedValue({ role: "member" });
  });

  test("normal status updates forward reason to updateAgentStatus", async () => {
    mocks.updateAgentStatus.mockResolvedValueOnce({
      status: { status: "away", status_reason: "break" },
      transition: { from: "available", to: "away", reason: "break" },
    });
    const { action } = await import(
      "../app/routes/api+/agent-status.action.server"
    );
    const res = await asRouteResponse(
      action({
        request: new Request("http://x/api/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: "w1",
            status: "away",
            reason: "break",
          }),
        }),
        params: {},
        context: {},
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateAgentStatus).toHaveBeenCalledWith(
      "w1",
      "u1",
      "away",
      "break",
    );
    expect(mocks.heartbeatAgentStatus).not.toHaveBeenCalled();
  });

  test("heartbeat intent updates last_heartbeat_at without status mutation", async () => {
    mocks.heartbeatAgentStatus.mockResolvedValueOnce(undefined);
    const { action } = await import(
      "../app/routes/api+/agent-status.action.server"
    );
    const res = await asRouteResponse(
      action({
        request: new Request("http://x/api/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: "w1",
            intent: "heartbeat",
          }),
        }),
        params: {},
        context: {},
      } as any),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.heartbeatAgentStatus).toHaveBeenCalledWith("w1", "u1");
    expect(mocks.updateAgentStatus).not.toHaveBeenCalled();
  });

  test("returns 400 when updateAgentStatus rejects the transition", async () => {
    mocks.updateAgentStatus.mockResolvedValueOnce({
      error: "Invalid transition: offline → busy",
    });
    const { action } = await import(
      "../app/routes/api+/agent-status.action.server"
    );
    const res = await asRouteResponse(
      action({
        request: new Request("http://x/api/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: "w1",
            status: "busy",
          }),
        }),
        params: {},
        context: {},
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid transition: offline → busy",
    });
  });
});
