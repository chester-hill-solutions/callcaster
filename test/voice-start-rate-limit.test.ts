import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs, withWorkspaceRouteArgs } from "./helpers/route-context-mock";
import { setJsonAuthSession, setJsonAuthUnauthorized } from "./helpers/route-auth-mock";
import { checkRateLimit, resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";

const mocks = vi.hoisted(() => ({
  userId: "user-1",
  testCall: vi.fn(),
  testSms: vi.fn(),
  start: vi.fn(),
  create: vi.fn(),
  campaignType: "simple_ivr",
}));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: async () => ({ user: { id: mocks.userId }, headers: new Headers({ "Set-Cookie": "voice-session=refreshed" }) }),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  getUserRole: async () => ({ role: "admin" }),
  requireWorkspaceAccess: async () => undefined,
  getHandsetNumberForWorkspace: async () => ({ data: { phone_number: "+15555550100" } }),
  createWorkspaceTwilioInstance: async () => ({ calls: { create: mocks.create } }),
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/user-audio.server")>(),
  getUserVerifiedAudioNumbers: async () => ["+15555550101"],
}));
vi.mock("@/lib/workspace-credits.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-credits.server")>(),
  getWorkspaceCreditsBalance: async () => 100,
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campaign-ivr.server")>(),
  findCampaignInWorkspace: async () => ({ id: 1, type: mocks.campaignType }),
}));
vi.mock("@/lib/campaign-test-call.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campaign-test-call.server")>(),
  sendCampaignTestCall: mocks.testCall,
}));
vi.mock("@/lib/campaign-test-send.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campaign-test-send.server")>(),
  sendCampaignTestSms: mocks.testSms,
}));
vi.mock("@/lib/auto-dial-start.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auto-dial-start.server")>(),
  startAutoDialConference: mocks.start,
}));
vi.mock("@/lib/audit-event.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/audit-event.server")>(),
  safeRecordWorkspaceAuditEvent: async () => undefined,
}));

const routes = {
  dial: () => import("../app/routes/api+/dial.action.server"),
  ivr: () => import("../app/routes/api+/ivr.action.server"),
  phone: () => import("../app/routes/api+/connect-phone-device.action.server"),
};

function post(body: unknown = {}) {
  return new Request("http://localhost/api/start", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

// Published voice-start contract: one shared 120-start/minute budget per
// authenticated credential. Do not derive the expected ceiling from the code.
async function spend(principal: string, count = 120) {
  for (let i = 0; i < count; i++) {
    await checkRateLimit({ key: `api-write:api-voice:${principal}`, limit: 120, windowMs: 60_000 });
  }
}

async function expectLimited(response: Response) {
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  await expect(response.json()).resolves.toMatchObject({ error: "Too many requests", code: "rate_limited" });
}

async function start(agentUserId = "agent-1", keyId?: string, scopes = ["calls.start"]) {
  const { action } = await import("../app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.action.server");
  return asRouteResponse(action(await withDataPlaneRouteArgs({
    request: post({ caller_id: "+15555550100", selected_device: "computer", agentUserId }),
    params: { workspaceId: "w1", campaignId: "1" },
  }, keyId ? { userId: null, apiKey: { keyId, scopes } } : { userId: mocks.userId })));
}

async function testSend() {
  const { action } = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.action.server");
  return asRouteResponse(action(await withWorkspaceRouteArgs({
    request: post({ intent: "test_send", phone: "+15555550101" }),
    params: { id: "w1", selected_id: "1" },
  }, { userId: mocks.userId })));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  resetRateLimitsForTests();
  mocks.userId = "user-1";
  mocks.campaignType = "simple_ivr";
  mocks.testCall.mockResolvedValue({ ok: true, to: "+15555550101" });
  mocks.testSms.mockResolvedValue({ ok: true, to: "+15555550101" });
  mocks.start.mockResolvedValue({ ok: true, conferenceName: "agent-1~proof" });
  mocks.create.mockResolvedValue({ sid: "CAproof" });
  setJsonAuthSession({ user: { id: mocks.userId } });
});
afterEach(() => vi.useRealTimers());

describe("funded voice request limits", () => {
  test.each(["dial", "ivr", "phone"] as const)("%s refuses before parsing or provider work", async (name) => {
    await spend("user-1");
    const { action } = await routes[name]();
    const request = post({ user_id: "forged", workspace_id: "other-workspace" });
    request.headers.set("x-forwarded-for", "203.0.113.99");
    await expectLimited(await asRouteResponse(action({ request, params: {}, context: {} } as never)));
    expect(request.bodyUsed).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  test("a refused phone connection keeps refreshed session headers", async () => {
    await spend("user-1");
    const { action } = await routes.phone();
    const response = await asRouteResponse(action({ request: post(), params: {}, context: {} } as never));
    await expectLimited(response);
    expect(response.headers.get("Set-Cookie")).toBe("voice-session=refreshed");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("bearer and cookie sessions share the same user's budget", async () => {
    await spend("user-1");
    setJsonAuthSession({ user: { id: "user-1" }, authType: "bearer" });
    const { action } = await routes.dial();
    await expectLimited(await asRouteResponse(action({ request: post(), params: {}, context: {} } as never)));
  });

  test("Retry-After reports the remaining window", async () => {
    await spend("user-1");
    vi.setSystemTime(new Date("2026-10-29T12:00:10Z"));
    const { action } = await routes.dial();
    const response = await asRouteResponse(action({ request: post(), params: {}, context: {} } as never));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("50");
  });

  test("manual and IVR starts share one user budget", async () => {
    await spend("user-1", 119);
    const { action: dial } = await routes.dial();
    const under = await asRouteResponse(dial({ request: post(), params: {}, context: {} } as never));
    expect(under.status).toBe(400);
    setJsonAuthSession({ user: { id: "user-1" } });
    const { action: ivr } = await routes.ivr();
    await expectLimited(await asRouteResponse(ivr({ request: post(), params: {}, context: {} } as never)));
  });

  test("a different user can still start a phone call", async () => {
    await spend("user-1");
    mocks.userId = "user-2";
    const { action } = await routes.phone();
    const response = await asRouteResponse(action({
      request: post({ workspaceId: "w1", phoneNumber: "+15555550101" }), params: {}, context: {},
    } as never));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, callSid: "CAproof" });
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  test("the fixed minute window opens again", async () => {
    await spend("user-1");
    const { action } = await routes.dial();
    await expectLimited(await asRouteResponse(action({ request: post(), params: {}, context: {} } as never)));
    vi.setSystemTime(new Date("2026-10-29T12:01:00Z"));
    setJsonAuthSession({ user: { id: "user-1" } });
    const response = await asRouteResponse(action({ request: post(), params: {}, context: {} } as never));
    expect(response.status).toBe(400);
  });

  test("unauthenticated manual calls still get 401", async () => {
    await spend("user-1");
    setJsonAuthUnauthorized();
    const { action } = await routes.dial();
    const response = await asRouteResponse(action({ request: post(), params: {}, context: {} } as never));
    expect(response.status).toBe(401);
  });

  test("workspace dialer uses the session user's shared budget", async () => {
    await spend("user-1");
    await expectLimited(await start());
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test("API-key budget stays with the key when the requested agent changes", async () => {
    await spend("key-1");
    await expectLimited(await start("agent-1", "key-1"));
    await expectLimited(await start("agent-2", "key-1"));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test("other API keys and the agent's own exhausted user budget are independent", async () => {
    await spend("key-1");
    await spend("agent-1");
    const response = await start("agent-1", "key-2");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, conferenceName: "agent-1~proof" });
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  test("an exhausted key with no call scope still gets 403", async () => {
    await spend("key-1");
    expect((await start("agent-1", "key-1", ["messages.send"])).status).toBe(403);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test("voice campaign tests share the user's start budget", async () => {
    await spend("user-1");
    await expectLimited(await testSend());
    expect(mocks.testCall).not.toHaveBeenCalled();
  });

  test("ordinary campaign voice tests still send", async () => {
    const response = await testSend();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, kind: "call", to: "+15555550101" });
    expect(mocks.testCall).toHaveBeenCalledOnce();
  });

  test("voice exhaustion does not block a campaign SMS test", async () => {
    await spend("user-1");
    mocks.campaignType = "message";
    const response = await testSend();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, kind: "message" });
    expect(mocks.testSms).toHaveBeenCalledOnce();
  });
});
