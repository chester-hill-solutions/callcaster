import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  safeParseJson: vi.fn(),
  rpcCreateOutreachAttempt: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers() }),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...args: unknown[]) => mocks.rpcCreateOutreachAttempt(...args),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveContactWorkspaceId: vi.fn(async () => "w1"),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    execute: vi.fn(async () => []),
  }),
}));

describe("app/routes/api+/outreach-attempts/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.rpcCreateOutreachAttempt.mockReset();
  });

  test("returns json({ error }) when rpc errors", async () => {
    queueJsonAuthSession({
      headers: new Headers({ "Set-Cookie": "a=1" }),
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, contact_id: 2, queue_id: 3 });
    mocks.rpcCreateOutreachAttempt.mockRejectedValueOnce(new Error("nope"));

    const mod = await import("../app/routes/api+/outreach-attempts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ error: new Error("nope") });
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(expect.anything(), {
      contactId: 2,
      campaignId: 1,
      userId: "u1",
      workspaceId: "w1",
      queueId: 3,
    });
  });

  test("returns data with headers and handles missing user", async () => {
    queueJsonAuthSession({
      headers: new Headers({ "Set-Cookie": "b=2" }),
      user: { id: "" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: "10", contact_id: "20", queue_id: "30" });
    mocks.rpcCreateOutreachAttempt.mockResolvedValueOnce(123);

    const mod = await import("../app/routes/api+/outreach-attempts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(123);
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(expect.anything(), {
      contactId: 20,
      campaignId: 10,
      userId: "",
      workspaceId: "w1",
      queueId: 30,
    });
  });
});
