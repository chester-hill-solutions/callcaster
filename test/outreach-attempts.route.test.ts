import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    safeParseJson: vi.fn(),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));

describe("app/routes/api.outreach-attempts.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.safeParseJson.mockReset();
  });

  test("returns json({ error }) when rpc errors", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: { rpc },
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, contact_id: 2, queue_id: 3 });

    const mod = await import("../app/routing/api/api.outreach-attempts");
    const res = await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ error: { message: "nope" } });
    expect(rpc).toHaveBeenCalledWith("create_outreach_attempt", {
      con_id: 2,
      cam_id: 1,
      usr_id: "u1",
      wks_id: "",
      queue_id: 3,
    });
  });

  test("returns data with headers and handles missing user", async () => {
    const headers = new Headers({ "Set-Cookie": "b=2" });
    const rpc = vi.fn().mockResolvedValueOnce({ data: 123, error: null });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: { rpc },
      headers,
      user: null,
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: "10", contact_id: "20", queue_id: "30" });

    const mod = await import("../app/routing/api/api.outreach-attempts");
    const res = await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("b=2");
    await expect(res.json()).resolves.toEqual(123);
    expect(rpc).toHaveBeenCalledWith("create_outreach_attempt", {
      con_id: 20,
      cam_id: 10,
      usr_id: "",
      wks_id: "",
      queue_id: 30,
    });
  });
});

