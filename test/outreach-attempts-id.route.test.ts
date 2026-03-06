import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
    safeParseJson: vi.fn(),
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  createSupabaseServerClient: (...args: any[]) => mocks.createSupabaseServerClient(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));

describe("app/routes/api.outreach_attempts.$id.js", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSupabaseServerClient.mockReset();
    mocks.safeParseJson.mockReset();
  });

  test("returns json({ error }) when update errors", async () => {
    const headers = new Headers({ "Set-Cookie": "x=1" });
    const eq = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "bad" } });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: { from }, headers });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { a: 1 } });

    const mod = await import("../app/routes/api.outreach_attempts.$id");
    const res = await mod.action({
      request: new Request("http://localhost/api/outreach_attempts/1", { method: "POST" }),
      params: { id: "1" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ error: { message: "bad" } });
    expect(from).toHaveBeenCalledWith("outreach_attempts");
    expect(update).toHaveBeenCalledWith({ a: 1 });
    expect(eq).toHaveBeenCalledWith("id", "1");
  });

  test("returns data with headers on success", async () => {
    const headers = new Headers({ "Set-Cookie": "y=2" });
    const eq = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: { from }, headers });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { disposition: "completed" } });

    const mod = await import("../app/routes/api.outreach_attempts.$id");
    const res = await mod.action({
      request: new Request("http://localhost/api/outreach_attempts/2", { method: "POST" }),
      params: { id: "2" },
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("y=2");
    await expect(res.json()).resolves.toEqual([{ id: 1 }]);
  });
});

