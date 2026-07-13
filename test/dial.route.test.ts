import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    getWorkspaceMessagingOnboardingState: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
  };
});

const creditsState = vi.hoisted(() => ({
  credits: 10,
  throwError: null as string | null,
}));

const tenantDbState = vi.hoisted(() => ({
  callerIdRecord: { type: "rented", phone_number: "+1555" } as any,
}));

const autoDialState = vi.hoisted(() => ({
  createOutreachAttempt: vi.fn(async () => 77),
  saveCallError: null as Error | null,
}));

vi.mock("../app/lib/client.server", () => ({
  getSession: (...args: any[]) => mocks.getSession(...args),
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("../app/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("../app/lib/request-utils.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
}));
vi.mock("../app/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...args: any[]) => mocks.getWorkspaceMessagingOnboardingState(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => {
    if (creditsState.throwError) throw new Error(creditsState.throwError);
    return creditsState.credits;
  }),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    workspace_number: {
      findFirst: vi.fn(async () => tenantDbState.callerIdRecord),
    },
  })),
  withAppCurrentUser: vi.fn((_userId, fn) => fn({} as any)),
}));
vi.mock("@/lib/auto-dial.server", () => ({
  createOutreachAttempt: (...args: any[]) => autoDialState.createOutreachAttempt(...args),
  saveCallToDatabase: vi.fn(async () => {
    if (autoDialState.saveCallError) {
      mocks.logger.error("Error saving the call to the database:", autoDialState.saveCallError);
    }
  }),
}));

vi.mock("twilio", () => {
  class VoiceResponse {
    private said: string[] = [];
    say(t: string) {
      this.said.push(t);
    }
    toString() {
      return `<Response>${this.said.map((s) => `<Say>${s}</Say>`).join("")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

describe("app/routes/api+/dial/tsx.route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceMessagingOnboardingState.mockReset();
    mocks.logger.error.mockReset();
    autoDialState.createOutreachAttempt.mockReset();
    autoDialState.createOutreachAttempt.mockResolvedValue(77);
    autoDialState.saveCallError = null;
    creditsState.credits = 10;
    creditsState.throwError = null;
    tenantDbState.callerIdRecord = { type: "rented", phone_number: "+1555" };
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue({
      emergencyVoice: {
        enabled: false,
        allowedCallerIdTypes: ["rented"],
        emergencyEligiblePhoneNumbers: [],
      },
    });
  });

  test("throws 401 Response when user missing", async () => {
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15550001111",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: null });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/dial", { method: "POST" }),
    } as any));
    expect(res.status).toBe(401);
  });

  test("returns creditsError when credits <= 0", async () => {
    creditsState.credits = 0;
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15550001111",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect(res.status).toBe(402);
    expect(res).toMatchObject({ creditsError: true });
  });

  test("happy path uses outreach_id when provided and upserts call", async () => {
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "1+5555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      outreach_id: "oa1",
      caller_id: "+1555",
      selected_device: "computer",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    const callsCreate = vi.fn(async () => ({ sid: "CA1", from: "+1555" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: callsCreate } });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect((res as Response).headers.get("Content-Type")).toBe("text/xml");
    expect(autoDialState.createOutreachAttempt).not.toHaveBeenCalled();
    expect(callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/api/dial/%2B15555550100"),
      }),
    );
  });

  test("creates outreach attempt when outreach_id missing", async () => {
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
      selected_device: "+15550001111",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect((res as Response).headers.get("Content-Type")).toBe("text/xml");
    expect(autoDialState.createOutreachAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_phone: "+15555550100",
      }),
      1,
      "w1",
      "u1",
    );
  });

  test("invalid phone number throws before calling Twilio", async () => {
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+123",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    // The handler factory maps thrown errors through createErrorResponse
    // instead of letting them propagate to the framework.
    const res = await asRouteResponse((await import("../app/routes/api+/dial")).action({
      request: new Request("http://localhost/api/dial", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid phone number length"),
    });
  });

  test("call create error logs and says message", async () => {
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => Promise.reject(new Error("tw")) },
    });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    const xml = await (res as Response).text();
    expect(xml).toContain("There was an error placing your call");
    expect(mocks.logger.error).toHaveBeenCalledWith("Error placing call:", expect.any(Error));
  });

  test("throws when workspace credits query errors", async () => {
    creditsState.throwError = "db";
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });

    const mod = await import("../app/routes/api+/dial");
    // The handler factory maps thrown errors through createErrorResponse
    // instead of letting them propagate to the framework.
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("db") });
  });

  test("throws when create_outreach_attempt rpc errors", async () => {
    autoDialState.createOutreachAttempt.mockRejectedValueOnce(new Error("rpc"));
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect(await (res as Response).text()).toContain("There was an error placing your call");
  });

  test("logs when call upsert fails", async () => {
    autoDialState.saveCallError = new Error("upsert");
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      outreach_id: "oa1",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api+/dial");
    await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.any(Error),
    );
  });

  test("blocks emergency-compliant dialing when caller id is not emergency-ready", async () => {
    tenantDbState.callerIdRecord = { type: "caller_id", phone_number: "+1555" };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
      selectedChannels: ["voice_compliance"],
      emergencyVoice: {
        enabled: true,
        allowedCallerIdTypes: ["rented"],
        emergencyEligiblePhoneNumbers: ["+1999"],
      },
    });

    const mod = await import("../app/routes/api+/dial");
    // The handler factory returns thrown Responses as-is instead of
    // letting them propagate to the framework.
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
  });

  test("does not enforce emergency voice when the voice track is not selected", async () => {
    tenantDbState.callerIdRecord = { type: "caller_id", phone_number: "+1555" };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers() });
    mocks.parseActionRequest.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
      selectedChannels: ["a2p10dlc"],
      emergencyVoice: {
        enabled: true,
        allowedCallerIdTypes: ["rented"],
        emergencyEligiblePhoneNumbers: [],
      },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api+/dial");
    const res = await asRouteResponse(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any));

    expect((res as Response).headers.get("Content-Type")).toBe("text/xml");
  });
});
