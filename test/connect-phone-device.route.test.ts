import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    getSession: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    checkSchedule: vi.fn(() => true),
    getHandsetNumberForWorkspace: vi.fn(async () => ({ data: { phone_number: "+15550000000" }, error: null })),
    getUserVerifiedAudioNumbers: vi.fn(async () => ["+15551112222"]),
    findCampaignInWorkspace: vi.fn(async () => ({
      id: 1,
      schedule: { monday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] } },
    })),
    getWorkspaceCreditsBalance: vi.fn(async () => 10),
    createWorkspaceTwilioInstance: vi.fn(),
    twilioCreate: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn(), warn: vi.fn()},
    env: {
      BASE_URL: () => "https://base.example",
    },
  };
});

vi.mock("@/lib/database/campaign.server", () => ({
  checkSchedule: (...args: any[]) => mocks.checkSchedule(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
  getHandsetNumberForWorkspace: (...args: any[]) =>
    mocks.getHandsetNumberForWorkspace(...args),
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/auth.server", () => ({
  getSession: (...args: any[]) => mocks.getSession(...args),
}));
vi.mock("@/lib/user-audio.server", () => ({
  getUserVerifiedAudioNumbers: (...args: any[]) => mocks.getUserVerifiedAudioNumbers(...args),
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: (...args: any[]) => mocks.findCampaignInWorkspace(...args),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: any[]) => mocks.getWorkspaceCreditsBalance(...args),
}));
vi.mock("@/twilio.server", () => ({
  twilio: { calls: { create: (...args: any[]) => mocks.twilioCreate(...args) } },
  createParentTwilioInstance: () => ({ calls: { create: (...args: any[]) => mocks.twilioCreate(...args) } }),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

describe("app/routes/api+/connect-phone-device/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.getSession.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.twilioCreate.mockReset();
    mocks.logger.error.mockReset();
    mocks.checkSchedule.mockReset().mockReturnValue(true);
    mocks.getHandsetNumberForWorkspace.mockReset().mockResolvedValue({ data: { phone_number: "+15550000000" }, error: null });
    mocks.getUserVerifiedAudioNumbers.mockReset().mockResolvedValue(["+15551112222"]);
    mocks.findCampaignInWorkspace.mockReset().mockResolvedValue({
      id: 1,
      schedule: { monday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] } },
    });
    mocks.getWorkspaceCreditsBalance.mockReset().mockResolvedValue(10);
  });

  test("returns 401 when no user", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: null,
      headers: new Headers({ "X-Test": "1" }),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+1555",
      workspaceId: "w1",
      campaignId: "1",
    });

    const mod = await import("../app/routes/api+/connect-phone-device");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/connect-phone-device", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("creates call and returns callSid with headers", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "u1" },
      headers,
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: (...args: any[]) => mocks.twilioCreate(...args) },
    });
    mocks.twilioCreate.mockResolvedValueOnce({ sid: "CA1" });

    const mod = await import("../app/routes/api+/connect-phone-device");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({ success: true, callSid: "CA1" });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({
      user: { id: "u1" },
      workspaceId: "w1",
    });
    expect(mocks.twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551112222",
        from: "+15550000000",
        url: "https://base.example/api/connect-campaign-conference/w1/1",
        method: "GET",
      }),
    );
  });

  test("returns 402 with creditsError when workspace balance is depleted", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "u1" },
      headers: new Headers(),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.getWorkspaceCreditsBalance.mockResolvedValueOnce(0);

    const mod = await import("../app/routes/api+/connect-phone-device");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any));
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "Insufficient credits",
      creditsError: true,
    });
    expect(mocks.twilioCreate).not.toHaveBeenCalled();
  });

  test("returns 404 when workspace credit balance is not found (null)", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "u1" },
      headers: new Headers(),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.getWorkspaceCreditsBalance.mockResolvedValueOnce(null);

    const mod = await import("../app/routes/api+/connect-phone-device");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Workspace not found",
      code: "NOT_FOUND",
      statusCode: 404,
      details: undefined,
    });
    expect(mocks.twilioCreate).not.toHaveBeenCalled();
  });

  test("returns 500 when Twilio call create throws", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "u1" },
      headers: new Headers(),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: (...args: any[]) => mocks.twilioCreate(...args) },
    });
    mocks.twilioCreate.mockRejectedValueOnce(new Error("twilio"));

    const mod = await import("../app/routes/api+/connect-phone-device");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "twilio" });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error connecting phone device:",
      expect.any(Error),
    );
  });
});

