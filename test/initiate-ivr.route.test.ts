import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession, queueJsonAuthUnauthorized } from "./helpers/route-auth-mock";
import { rpcGetCampaignQueue } from "@/lib/db-rpc.server";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440000";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    verifyAuth: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    normalizePhoneNumber: vi.fn((p: string) => `+${p}`),
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
    fetch: vi.fn(),
  };
});

// The recipient calling window is wall-clock dependent; pin it open so these
// tests are not time-of-day sensitive (window logic is covered in
// test/recipient-calling-window.test.ts).
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: vi.fn(() => ({
    allowed: true,
    timezone: "America/Toronto",
    reason: "in_window",
  })),
  isWithinRecipientCallingWindow: vi.fn(() => true),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...a: any[]) => mocks.requireWorkspaceAccess(...a),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...a: any[]) => mocks.safeParseJson(...a),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignByIdForWorkspace: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcGetCampaignQueue: vi.fn(),
}));
vi.mock("../app/lib/adminDb.server", () => ({
  verifyAuth: (...a: any[]) => mocks.verifyAuth(...a),
}));
vi.mock("../app/lib/utils", () => ({
  normalizePhoneNumber: (...a: any[]) => mocks.normalizePhoneNumber(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

describe("app/routes/api+/initiate-ivr/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.normalizePhoneNumber.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("authenticates before parsing JSON body", async () => {
    queueJsonAuthUnauthorized();
    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://x", { method: "POST", body: "{bad json" }),
    } as any));
    expect(res.status).toBe(401);
    expect(mocks.safeParseJson).not.toHaveBeenCalled();
  });

  test("returns 500 when get_campaign_queue rpc errors", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    vi.mocked(rpcGetCampaignQueue).mockRejectedValueOnce(new Error("rpc"));
    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "rpc" });
  });

  test("returns creditsError when ivr endpoint reports creditsError", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    vi.mocked(rpcGetCampaignQueue).mockResolvedValueOnce([
      { id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" },
    ]);
    mocks.fetch.mockResolvedValueOnce({
      json: async () => ({ creditsError: true }),
    } as any);
    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(402);
    expect(res).toMatchObject({ creditsError: true });
  });

  test("halts the queue loop after the first creditsError response", async () => {
    const queue = [
      { id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" },
      { id: "q2", contact_id: "c2", caller_id: "+1", phone: "556" },
      { id: "q3", contact_id: "c3", caller_id: "+1", phone: "557" },
    ];
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    vi.mocked(rpcGetCampaignQueue).mockResolvedValueOnce(queue);
    mocks.fetch.mockResolvedValueOnce({
      status: 402,
      json: async () => ({ creditsError: true }),
    } as any);

    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(402);
    expect(res).toMatchObject({ creditsError: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  test("logs fetch error and continues (res null), returning queue data", async () => {
    const queue = [{ id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" }];
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    vi.mocked(rpcGetCampaignQueue).mockResolvedValueOnce(queue);
    mocks.fetch.mockRejectedValueOnce(new Error("net"));

    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual(queue);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error initiating IVR call:", expect.any(Error));
  });
});
