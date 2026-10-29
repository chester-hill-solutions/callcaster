import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { setJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn<typeof import("@/lib/manual-voice-dispatch.server").dispatchManualVoiceCall>(),
  replay: vi.fn<typeof import("@/server/voice-credit-reservation.server").replayVoiceOperation>(),
  create: vi.fn(async () => ({ sid: "CA_ACCEPTED_SETUP" })),
  access: vi.fn(), verified: vi.fn(async () => ["+16135550101"]),
  onboarding: vi.fn(), window: vi.fn(), number: vi.fn(),
}));
vi.mock("@/lib/manual-voice-dispatch.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/manual-voice-dispatch.server")>(), dispatchManualVoiceCall: mocks.dispatch,
}));
vi.mock("@/server/voice-credit-reservation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-credit-reservation.server")>(), replayVoiceOperation: mocks.replay,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(), requireWorkspaceAccess: mocks.access,
  createWorkspaceTwilioInstance: async () => ({ accountSid: "AC_OWNED", calls: { create: mocks.create } }),
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/tenant-db")>(),
  createTenantDb: () => ({ campaign: { findFirst: async () => ({ id: 1 }) }, contact: { findFirst: async () => ({ id: 2 }) },
    campaign_queue: { findFirst: async () => ({ id: 3 }) }, outreach_attempt: { findFirst: async () => ({ id: 7 }) },
    workspace_number: { findFirst: mocks.number } }),
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/user-audio.server")>(), getUserVerifiedAudioNumbers: mocks.verified,
}));
vi.mock("@/lib/messaging-onboarding.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/messaging-onboarding.server")>(), getWorkspaceMessagingOnboardingState: mocks.onboarding,
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(), recipientCallingWindowStatus: mocks.window,
}));

const payload = { to_number: "+16135550100", caller_id: "+16135550102", user_id: "actor", campaign_id: "1", contact_id: "2",
  workspace_id: "owned-workspace", queue_id: "3" };
async function submit(overrides: Record<string, string> = {}) {
  const { action } = await import("../app/routes/api+/dial.action.server");
  return asRouteResponse(action(routeArgs(new Request("http://localhost/api/dial", {
    method: "POST", body: new URLSearchParams({ ...payload, ...overrides }),
  }))));
}

describe("manual dial route contract", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server"); resetRateLimitsForTests();
    setJsonAuthSession({ user: { id: "actor" } });
    mocks.dispatch.mockResolvedValue({ ok: true, callSid: "CA_ACCEPTED_SETUP", replayed: false });
    mocks.replay.mockResolvedValue(null);
    mocks.window.mockReturnValue({ allowed: true, timezone: "America/Toronto", reason: "in_window" });
    mocks.number.mockResolvedValue({ type: "local", phone_number: payload.caller_id });
    mocks.verified.mockResolvedValue(["+16135550101"]);
    mocks.onboarding.mockResolvedValue({ selectedChannels: [], emergencyVoice: { enabled: false } });
  });
  test("requires an authenticated actor before funding", async () => {
    setJsonAuthSession({ user: null }); expect((await submit()).status).toBe(401); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  test("passes the authenticated intent and queue generation to shared funding", async () => {
    const intent = randomUUID(), generation = randomUUID();
    const response = await submit({ dial_intent_id: intent, expected_queue_generation: generation, outreach_id: "7" });
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.access).toHaveBeenCalledWith({ user: expect.objectContaining({ id: "actor" }), workspaceId: "owned-workspace" });
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "owned-workspace", kind: "staffed", accountSid: "AC_OWNED",
      to: payload.to_number, from: payload.caller_id, setupTo: "client:actor", userId: "actor", campaignId: 1, contactId: 2, queueId: 3,
      outreachAttemptId: 7, operationKey: `manual:actor:${intent}`, expectedQueueGeneration: generation }));
    const args = mocks.dispatch.mock.calls[0]?.[0]; if (!args) throw new Error("Expected funded adapter call");
    await args.create({ voiceUrl: "https://owned.example/voice?credit_reservation=owned", statusCallback: "https://owned.example/status?credit_reservation=owned", recipientStatusCallback: "https://owned.example/recipient" });
    expect(mocks.create).toHaveBeenCalledWith({ to: "client:actor", from: payload.caller_id,
      url: "https://owned.example/voice?credit_reservation=owned", statusCallback: "https://owned.example/status?credit_reservation=owned",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] });
  });
  test("a matching accepted replay avoids new admission", async () => {
    mocks.replay.mockResolvedValue({ ok: false, reason: "already_dispatched", callSid: "CA_ACCEPTED_SETUP", queueGeneration: randomUUID() });
    expect((await submit({ dial_intent_id: randomUUID() })).status).toBe(200); expect(mocks.dispatch).not.toHaveBeenCalled(); expect(mocks.window).not.toHaveBeenCalled();
  });
  test("a verified phone is the setup target", async () => {
    expect((await submit({ selected_device: "+16135550101" })).status).toBe(200);
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ setupTo: "+16135550101" }));
  });
  test.each([{ user_id: "other" }, { selected_device: "+16135550199" }, { to_number: "+123" }, { dial_intent_id: "bad" }])("refuses invalid ownership or input: %j", async (input) => {
    expect([400, 403]).toContain((await submit(input)).status); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  test("a closed calling window refuses before funding", async () => {
    mocks.window.mockReturnValue({ allowed: false, timezone: "America/Toronto", reason: "outside_window" });
    const response = await submit(); expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "recipient_window_closed" });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  test("an emergency voice track requires an eligible caller ID", async () => {
    mocks.onboarding.mockResolvedValue({ selectedChannels: ["voice_compliance"], emergencyVoice: {
      enabled: true, allowedCallerIdTypes: ["toll-free"], emergencyEligiblePhoneNumbers: [payload.caller_id] } });
    expect((await submit()).status).toBe(400); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  test("an eligible emergency caller ID is admitted", async () => {
    mocks.onboarding.mockResolvedValue({ selectedChannels: ["voice_compliance"], emergencyVoice: {
      enabled: true, allowedCallerIdTypes: ["local"], emergencyEligiblePhoneNumbers: [payload.caller_id] } });
    expect((await submit()).status).toBe(200); expect(mocks.dispatch).toHaveBeenCalledOnce();
  });
  test("an unselected emergency track leaves ordinary voice available", async () => {
    mocks.onboarding.mockResolvedValue({ selectedChannels: ["a2p10dlc"], emergencyVoice: {
      enabled: true, allowedCallerIdTypes: [], emergencyEligiblePhoneNumbers: [] } });
    expect((await submit()).status).toBe(200);
  });
});
