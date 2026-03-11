import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    safeParseJson: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.scripts.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.logger.error.mockReset();
  });

  test("inserts when saveAsCopy or id missing (copy suffix branch)", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ id: 1, name: "N (Copy)" }], error: null });
    const insert = vi.fn().mockReturnValueOnce({ select });
    const from = vi.fn().mockReturnValueOnce({ insert });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { from }, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: 123,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: true,
    });

    const mod = await import("../app/routes/api.scripts");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 1, name: "N (Copy)" } });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: "N (Copy)", updated_by: "u1" }));
  });

  test("updates when id present and not saveAsCopy", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ id: 2, name: "N" }], error: null });
    const eq = vi.fn().mockReturnValueOnce({ select });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { from }, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: 2,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });

    const mod = await import("../app/routes/api.scripts");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ script: { id: 2, name: "N" } });
    expect(eq).toHaveBeenCalledWith("id", 2);
  });

  test("returns 400 on unique violation (23505)", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [], error: { code: "23505", message: "dup" } });
    const insert = vi.fn().mockReturnValueOnce({ select });
    const from = vi.fn().mockReturnValueOnce({ insert });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { from }, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: null,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });

    const mod = await import("../app/routes/api.scripts");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "A script with this name already exists in the workspace",
    });
  });

  test("returns 500 when supabase returns non-23505 error", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [], error: { code: "X", message: "nope" } });
    const insert = vi.fn().mockReturnValueOnce({ select });
    const from = vi.fn().mockReturnValueOnce({ insert });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { from }, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      id: null,
      name: "N",
      steps: {},
      workspace: "w1",
      saveAsCopy: false,
    });

    const mod = await import("../app/routes/api.scripts");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "nope" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

