import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    requireJsonAuth: vi.fn(),
    rpcCreateOutreachAttempt: vi.fn(),
    insertCallForWorkspace: vi.fn(),
    dequeueCampaignQueueById: vi.fn(),
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  };
});

const creditsState = vi.hoisted(() => ({
  credits: 10 as number | null,
}));

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

vi.mock("../app/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...a: any[]) =>
    mocks.createWorkspaceTwilioInstance(...a),
  requireWorkspaceAccess: (...a: any[]) => mocks.requireWorkspaceAccess(...a),
}));
vi.mock("@/lib/api-auth.server", () => ({
  requireJsonAuth: (...a: any[]) => mocks.requireJsonAuth(...a),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...a: any[]) => mocks.rpcCreateOutreachAttempt(...a),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: (...a: any[]) => mocks.insertCallForWorkspace(...a),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueCampaignQueueById: (...a: any[]) => mocks.dequeueCampaignQueueById(...a),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => creditsState.credits),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeRequest(fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x", { method: "POST", body: fd });
}

describe("app/routes/api+/ivr/tsx.route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireJsonAuth.mockReset();
    mocks.rpcCreateOutreachAttempt.mockReset();
    mocks.insertCallForWorkspace.mockReset();
    mocks.dequeueCampaignQueueById.mockReset();
    mocks.logger.error.mockReset();
    mocks.requireJsonAuth.mockResolvedValue({ user: { id: "u1" } });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.rpcCreateOutreachAttempt.mockResolvedValue(99);
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      calls: { create: async () => ({ sid: "CA1" }) },
    });
    mocks.insertCallForWorkspace.mockResolvedValue({ sid: "CA1" });
    mocks.dequeueCampaignQueueById.mockResolvedValue(undefined);
    creditsState.credits = 10;
  });

  test("returns 500 when required form data missing", async () => {
    const mod = await import("../app/routes/api+/ivr");
    const fd = new FormData();
    fd.set("to_number", "+1");
    const res = await asRouteResponse(
      mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Missing required form data" });
  });

  test("returns 402 creditsError when workspace balance is <= 0", async () => {
    creditsState.credits = 0;
    const mod = await import("../app/routes/api+/ivr");
    const res = await asRouteResponse(mod.action({
      request: makeRequest({
        to_number: "+1555",
        campaign_id: "1",
        workspace_id: "w1",
        contact_id: "2",
        caller_id: "+1666",
        queue_id: "3",
        user_id: "u1",
      }),
    } as any));
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "Insufficient credits",
      creditsError: true,
    });
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test("returns 404 when workspace credits balance is not found", async () => {
    creditsState.credits = null;
    const mod = await import("../app/routes/api+/ivr");
    const res = await asRouteResponse(mod.action({
      request: makeRequest({
        to_number: "+1555",
        campaign_id: "1",
        workspace_id: "w1",
        contact_id: "2",
        caller_id: "+1666",
        queue_id: "3",
        user_id: "u1",
      }),
    } as any));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Workspace not found",
      code: "NOT_FOUND",
      statusCode: 404,
      details: undefined,
    });
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test("success creates outreach, places call, inserts call, dequeues, returns JSON", async () => {
    const mod = await import("../app/routes/api+/ivr");
    const res = await asRouteResponse(mod.action({
      request: makeRequest({
        to_number: "+1555",
        campaign_id: "1",
        workspace_id: "w1",
        contact_id: "2",
        caller_id: "+1666",
        queue_id: "3",
        user_id: "u1",
      }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, callSid: "CA1" });
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(
      expect.anything(),
      {
        contactId: 2,
        campaignId: 1,
        userId: "u1",
        workspaceId: "w1",
        queueId: 3,
      },
    );
    expect(mocks.insertCallForWorkspace).toHaveBeenCalledWith(
      "w1",
      {
        sid: "CA1",
        to: "+1555",
        from: "+1666",
        campaign_id: 1,
        contact_id: 2,
        outreach_attempt_id: 99,
      },
    );
    expect(mocks.dequeueCampaignQueueById).toHaveBeenCalledWith({
      queueId: 3,
      userId: "u1",
      reason: "IVR call completed",
    });
  });

  test("returns 500 on errors (rpc/call insert/dequeue), with unknown error formatting", async () => {
    const mod = await import("../app/routes/api+/ivr");
    const makeReq = () => makeRequest({
      to_number: "+1555",
      campaign_id: "1",
      workspace_id: "w1",
      contact_id: "2",
      caller_id: "+1666",
      queue_id: "3",
      user_id: "u1",
    });

    mocks.rpcCreateOutreachAttempt.mockRejectedValueOnce(new Error("rpc"));
    let res = await asRouteResponse(mod.action({ request: makeReq() } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "rpc",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });

    mocks.insertCallForWorkspace.mockResolvedValueOnce(null);
    res = await asRouteResponse(mod.action({ request: makeReq() } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "Failed to insert call record",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });

    mocks.dequeueCampaignQueueById.mockRejectedValueOnce(new Error("dequeue"));
    res = await asRouteResponse(mod.action({ request: makeReq() } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "dequeue",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
