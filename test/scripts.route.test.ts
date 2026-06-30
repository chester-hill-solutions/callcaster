import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => {
  return {
    requireDualAuth: vi.fn(),
    getDualAuthUser: vi.fn(),
    safeParseJson: vi.fn(),
    insertScriptForWorkspace: vi.fn(),
    updateScriptForWorkspace: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthUser: (...args: unknown[]) => mocks.getDualAuthUser(...args),
}));

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));

vi.mock("@/lib/script-api-db.server", () => ({
  insertScriptForWorkspace: (...args: unknown[]) =>
    mocks.insertScriptForWorkspace(...args),
  updateScriptForWorkspace: (...args: unknown[]) =>
    mocks.updateScriptForWorkspace(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/scripts/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireDualAuth.mockReset();
    mocks.getDualAuthUser.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.insertScriptForWorkspace.mockReset();
    mocks.updateScriptForWorkspace.mockReset();
    mocks.logger.error.mockReset();
  });

  test("inserts when saveAsCopy or id missing (copy suffix branch)", async () => {
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.getDualAuthUser.mockReturnValueOnce({ id: "u1" });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: 123,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: true,
    });
    mocks.insertScriptForWorkspace.mockResolvedValueOnce({ id: 1, name: "N (Copy)" });

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 1, name: "N (Copy)" } });
    expect(mocks.insertScriptForWorkspace).toHaveBeenCalledWith({
      workspaceId: "w1",
      name: "N (Copy)",
      steps: {},
      updatedBy: "u1",
    });
  });

  test("updates when id present and not saveAsCopy", async () => {
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.getDualAuthUser.mockReturnValueOnce({ id: "u1" });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: 2,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });
    mocks.updateScriptForWorkspace.mockResolvedValueOnce({ id: 2, name: "N" });

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 2, name: "N" } });
    expect(mocks.updateScriptForWorkspace).toHaveBeenCalledWith({
      workspaceId: "w1",
      scriptId: 2,
      name: "N",
      steps: {},
      updatedBy: "u1",
    });
  });

  test("returns 400 on unique violation (23505)", async () => {
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.getDualAuthUser.mockReturnValueOnce({ id: "u1" });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: null,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });
    mocks.insertScriptForWorkspace.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint 23505"),
    );

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "A script with this name already exists in the workspace",
    });
  });

  test("returns 500 when insert throws non-23505 error", async () => {
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.getDualAuthUser.mockReturnValueOnce({ id: "u1" });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: null,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });
    mocks.insertScriptForWorkspace.mockRejectedValueOnce(new Error("nope"));

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "nope" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
