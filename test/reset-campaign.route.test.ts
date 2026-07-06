import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession, setJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  rpcResetCampaign: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcResetCampaign: (...args: unknown[]) => mocks.rpcResetCampaign(...args),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveCampaignWorkspaceId: vi.fn(async () => "w1"),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    execute: vi.fn(async () => []),
  }),
}));
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

describe("app/routes/api+/reset_campaign/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpcResetCampaign.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns error when campaign_id missing or not string", async () => {
    setJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/reset_campaign");

    const r1 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as any));
    await expect(r1.json()).resolves.toEqual({ error: "Missing campaign_id" });

    const fd2 = new FormData();
    fd2.set("campaign_id", new File(["x"], "x.txt") as any);
    const r2 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd2 }),
    } as any));
    await expect(r2.json()).resolves.toEqual({ error: "Missing campaign_id" });
  }, 30000);

  test("returns error when campaign_id is not a number", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "nope");
    const mod = await import("../app/routes/api+/reset_campaign");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    await expect(res.json()).resolves.toEqual({ error: "Invalid campaign_id" });
  }, 30000);

  test("throws when rpc errors", async () => {
    mocks.rpcResetCampaign.mockRejectedValueOnce({ message: "bad" });
    queueJsonAuthSession({ user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api+/reset_campaign");
    await expect(
      mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any),
    ).rejects.toEqual({ message: "bad" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error resetting campaign:", { message: "bad" });
  }, 30000);

  test("returns success true when rpc succeeds", async () => {
    mocks.rpcResetCampaign.mockResolvedValueOnce(undefined);
    queueJsonAuthSession({ user: { id: "u1" } });
    const fd = new FormData();
    fd.set("campaign_id", "10");
    const mod = await import("../app/routes/api+/reset_campaign");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.rpcResetCampaign).toHaveBeenCalledWith(expect.anything(), 10);
  }, 30000);
});
