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
    persistWorkspaceScript: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthUser: (...args: unknown[]) => mocks.getDualAuthUser(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));

vi.mock("@/lib/script-persistence.server", () => ({
  persistWorkspaceScript: (...args: unknown[]) =>
    mocks.persistWorkspaceScript(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/scripts/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireDualAuth.mockReset();
    mocks.getDualAuthUser.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.persistWorkspaceScript.mockReset();
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
    mocks.persistWorkspaceScript.mockResolvedValueOnce({ id: 1, name: "N (Copy)" });

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 1, name: "N (Copy)" } });
    expect(mocks.persistWorkspaceScript).toHaveBeenCalledWith({
      mode: "copy",
      workspaceId: "w1",
      actorId: "u1",
      sourceScriptId: 123,
      content: { name: "N", steps: {} },
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
    mocks.persistWorkspaceScript.mockResolvedValueOnce({ id: 2, name: "N" });

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 2, name: "N" } });
    expect(mocks.persistWorkspaceScript).toHaveBeenCalledWith({
      mode: "update",
      workspaceId: "w1",
      scriptId: 2,
      actorId: "u1",
      content: { name: "N", steps: {} },
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
    // Drizzle wrapper shape: SQLSTATE on `cause`, not on the error itself.
    const wrapped = new Error("Failed query: insert into script ...");
    (wrapped as Error & { cause: unknown }).cause = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      { code: "23505" },
    );
    mocks.persistWorkspaceScript.mockRejectedValueOnce(wrapped);

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
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
    mocks.persistWorkspaceScript.mockRejectedValueOnce(new Error("nope"));

    const mod = await import("../app/routes/api+/scripts");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as never),
    );
    expect(res.status).toBe(500);
    // Raw internals are no longer echoed to the client; a safe fallback is.
    await expect(res.json()).resolves.toEqual({
      error: "Failed to save the script. Please try again.",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
