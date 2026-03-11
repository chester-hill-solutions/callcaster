import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.reset_campaign.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns error when campaign_id missing or not string", async () => {
    const supabaseClient = { rpc: vi.fn() };
    mocks.verifyAuth.mockResolvedValue({ supabaseClient, user: { id: "u1" } });
    const mod = await import("../app/routes/api.reset_campaign");

    const r1 = await mod.action({
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as any);
    expect(r1).toEqual({ error: "Missing campaign_id" });

    const fd2 = new FormData();
    fd2.set("campaign_id", new File(["x"], "x.txt"));
    const r2 = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd2 }),
    } as any);
    expect(r2).toEqual({ error: "Missing campaign_id" });
  }, 30000);

  test("returns error when campaign_id is not a number", async () => {
    const supabaseClient = { rpc: vi.fn() };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "nope");
    const mod = await import("../app/routes/api.reset_campaign");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(res).toEqual({ error: "Invalid campaign_id" });
  }, 30000);

  test("throws when supabase rpc errors", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: "bad" } });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { rpc }, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api.reset_campaign");
    await expect(
      mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any),
    ).rejects.toEqual({ message: "bad" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error resetting campaign:", { message: "bad" });
  }, 30000);

  test("returns success true when rpc succeeds", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: null });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: { rpc }, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api.reset_campaign");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(res).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("reset_campaign", { campaign_id_prop: 10 });
  }, 30000);
});

