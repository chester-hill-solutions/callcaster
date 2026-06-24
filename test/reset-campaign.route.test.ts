import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/reset_campaign/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
  });

  test("returns error when campaign_id missing or not string", async () => {
    const supabaseClient = { rpc: vi.fn() };
    setDualAuthSession({ supabaseClient, user: { id: "u1" } });
    const mod = await import("../app/routes/api+/reset_campaign");

    const r1 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as any));
    await expect(r1.json()).resolves.toEqual({ error: "Missing campaign_id" });

    const fd2 = new FormData();
    fd2.set("campaign_id", new File(["x"], "x.txt"));
    const r2 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd2 }),
    } as any));
    await expect(r2.json()).resolves.toEqual({ error: "Missing campaign_id" });
  }, 30000);

  test("returns error when campaign_id is not a number", async () => {
    const supabaseClient = { rpc: vi.fn() };
    queueDualAuthSession({ supabaseClient, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "nope");
    const mod = await import("../app/routes/api+/reset_campaign");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    await expect(res.json()).resolves.toEqual({ error: "Invalid campaign_id" });
  }, 30000);

  test("throws when supabase rpc errors", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: "bad" } });
    queueDualAuthSession({ supabaseClient: { rpc }, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api+/reset_campaign");
    await expect(
      mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any),
    ).rejects.toEqual({ message: "bad" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error resetting campaign:", { message: "bad" });
  }, 30000);

  test("returns success true when rpc succeeds", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: null });
    queueDualAuthSession({ supabaseClient: { rpc }, user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api+/reset_campaign");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("reset_campaign", { campaign_id_prop: 10 });
  }, 30000);
});

