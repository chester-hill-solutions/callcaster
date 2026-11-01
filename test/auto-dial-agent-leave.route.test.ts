import "./helpers/legacy-voice-reservation-mock";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const boundary = vi.hoisted(() => ({
  findCall: vi.fn(), updateCall: vi.fn(), findAttempt: vi.fn(),
  claimStatus: vi.fn(), processStatus: vi.fn(), broadcast: vi.fn(),
  listConferences: vi.fn(), fetchConference: vi.fn(), completeConference: vi.fn(),
  signature: vi.fn(), createTwilio: vi.fn(), enqueueOutcome: vi.fn(), runOutcome: vi.fn(), legacyQueue: vi.fn(),
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  findCallBySid: boundary.findCall,
  updateCallBySid: boundary.updateCall,
  findOutreachAttemptById: boundary.findAttempt,
  claimTerminalCallStatus: boundary.claimStatus,
  findCampaignTypeByCampaignId: async () => "live_call",
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: boundary.createTwilio,
}));
vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-webhook.server")>()),
  requireTwilioSignature: boundary.signature,
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitPredictiveBroadcast: boundary.broadcast,
}));
vi.mock("@/lib/twilio-call-status.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-call-status.server")>()),
  processCallStatusWebhook: boundary.processStatus,
}));

vi.mock("@/lib/worker/enqueue-call-status.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/worker/enqueue-call-status.server")>(),
  enqueueCallStatusSideEffects: boundary.enqueueOutcome,
}));
vi.mock("@/lib/worker/webhook-side-effects.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/worker/webhook-side-effects.server")>(),
  runCallStatusSideEffects: boundary.runOutcome,
}));
vi.mock("@/server/legacy-voice-queue.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/legacy-voice-queue.server")>(),
  dequeueLegacyVoiceAttempt: boundary.legacyQueue,
}));

const conferenceName = "u1~conference";
const agent = {
  sid: "CA_AGENT", workspace: "w1", user_id: "u1", conference_id: conferenceName,
  contact_id: null, outreach_attempt_id: null, campaign_id: 42, status: "in-progress",
};

async function post(overrides: Record<string, string | null> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    CallSid: "CA_AGENT", StatusCallbackEvent: "participant-leave",
    ReasonParticipantLeft: "participant_hung_up", ParticipantCallStatus: "completed",
    FriendlyName: conferenceName, ConferenceSid: "CF_AGENT",
    Timestamp: "Thu, 1 Jun 2017 20:48:32 +0000", ...overrides,
  })) {
    if (value !== null) form.set(key, value);
  }
  const { action } = await import("@/routes/api+/auto-dial/status.action.server");
  return asRouteResponse(action({ request: new Request("https://app.test/api/auto-dial/status", {
    method: "POST", body: form,
  }), params: {}, context: {} }));
}

describe("agent participant hangup (#2094)", () => {
  beforeEach(() => {
    boundary.findCall.mockResolvedValue({ ...agent });
    boundary.updateCall.mockResolvedValue({ ...agent });
    boundary.findAttempt.mockResolvedValue(null);
    boundary.claimStatus.mockResolvedValue(true);
    boundary.processStatus.mockResolvedValue({ call: { ...agent }, billingResult: {} });
    boundary.broadcast.mockResolvedValue(null);
    boundary.signature.mockResolvedValue(null);
    boundary.enqueueOutcome.mockImplementation(async (_call: unknown, params: Record<string, string>) => {
      const { parseTwilioVoiceCallback } = await import("@/lib/twilio/voice-callback");
      return parseTwilioVoiceCallback(params);
    });
    boundary.runOutcome.mockResolvedValue({ ok: true });
    boundary.legacyQueue.mockResolvedValue({ ownedPrimary: false, removedCount: 0 });
    boundary.listConferences.mockResolvedValue([{ sid: "CF_AGENT" }]);
    boundary.fetchConference.mockResolvedValue({ friendlyName: conferenceName, status: "in-progress" });
    boundary.completeConference.mockResolvedValue({ status: "completed" });
    boundary.createTwilio.mockResolvedValue({ conferences: Object.assign(
      () => ({ update: boundary.completeConference, fetch: boundary.fetchConference }),
      { list: boundary.listConferences },
    ) });
  });

  test.each([{}, { CallStatus: "completed" }])("stops an agent bridge with provider or legacy fields %j", async (fields) => {
    const response = await post(fields);
    expect(response.status).toBe(200);
    expect(boundary.createTwilio).toHaveBeenCalledWith({ workspace_id: "w1" });
    expect(boundary.listConferences).toHaveBeenCalledWith({ friendlyName: conferenceName, status: "in-progress" });
    expect(boundary.completeConference).toHaveBeenCalledWith({ status: "completed" });
    expect(boundary.findAttempt).not.toHaveBeenCalled();
    expect(boundary.claimStatus).not.toHaveBeenCalled();
    expect(boundary.processStatus).not.toHaveBeenCalled();
    expect(boundary.broadcast).toHaveBeenCalledWith("w1", { contact_id: null, status: "completed", conference_id: conferenceName, conference_ended: true });
    expect(boundary.updateCall).toHaveBeenCalledWith("w1", "CA_AGENT", { end_time: new Date("2017-06-01T20:48:32Z") });
  });

  test("metadata failure cannot prevent conference completion or notification", async () => {
    boundary.updateCall.mockRejectedValue(new Error("database unavailable"));
    expect((await post()).status).toBe(200);
    expect(boundary.completeConference).toHaveBeenCalledWith({ status: "completed" });
    expect(boundary.broadcast).toHaveBeenCalledWith("w1", expect.objectContaining({ conference_id: conferenceName, status: "completed" }));
    expect(boundary.completeConference.mock.invocationCallOrder[0]).toBeLessThan(boundary.updateCall.mock.invocationCallOrder[0]);
  });

  test("a failed provider stop remains retryable and emits no end event", async () => {
    boundary.completeConference.mockRejectedValue(new Error("provider unavailable"));
    expect((await post()).status).toBe(500);
    expect(boundary.broadcast).not.toHaveBeenCalled();
    expect(boundary.updateCall).not.toHaveBeenCalled();
  });

  test("an already-ended conference is acknowledged and not completed again", async () => {
    boundary.listConferences.mockResolvedValue([]);
    expect((await post()).status).toBe(200);
    expect(boundary.completeConference).not.toHaveBeenCalled();
    expect(boundary.broadcast).toHaveBeenCalledWith("w1", expect.objectContaining({ conference_id: conferenceName }));
  });

  test("a SID-only callback resolves a friendly name when the call row has none", async () => {
    boundary.findCall.mockResolvedValue({ ...agent, conference_id: null });
    expect((await post({ FriendlyName: null })).status).toBe(200);
    expect(boundary.fetchConference).toHaveBeenCalledTimes(1);
    expect(boundary.listConferences).toHaveBeenCalledWith({ friendlyName: conferenceName, status: "in-progress" });
  });

  test("a callee hangup does not take the later terminal status/billing claim", async () => {
    boundary.findCall.mockResolvedValue({ ...agent, contact_id: 7, outreach_attempt_id: 21 });
    expect((await post()).status).toBe(200);
    expect(boundary.updateCall.mock.calls[0]?.[2]).not.toHaveProperty("status");
    expect(boundary.claimStatus).not.toHaveBeenCalled();
    expect(boundary.enqueueOutcome).not.toHaveBeenCalled();
    expect(boundary.runOutcome).not.toHaveBeenCalled();
    boundary.processStatus.mockResolvedValue({ call: { ...agent, status: "completed", contact_id: 7, outreach_attempt_id: 21 } });
    const terminal = await post({ StatusCallbackEvent: null, ReasonParticipantLeft: null, CallStatus: "completed", CallDuration: "42" });
    expect(terminal.status, JSON.stringify(await terminal.json())).toBe(200);
    expect(boundary.claimStatus).toHaveBeenCalledWith("w1", "CA_AGENT", "completed");
    expect(boundary.processStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", duration: "42" }),
      expect.objectContaining({ outreachAttemptId: 21, contactId: 7, skipBilling: true }));
    expect(boundary.enqueueOutcome).toHaveBeenCalledWith(expect.objectContaining({ sid: "CA_AGENT", contact_id: 7, outreach_attempt_id: 21 }),
      expect.objectContaining({ CallSid: "CA_AGENT", CallStatus: "completed", CallDuration: "42" }));
    expect(boundary.runOutcome).toHaveBeenCalledExactlyOnceWith({ callSid: "CA_AGENT", event: expect.objectContaining({ callStatus: "completed" }) });
    expect(boundary.legacyQueue).toHaveBeenCalledWith("w1", "CA_AGENT");
    expect(boundary.broadcast.mock.calls).toEqual([
      ["w1", { contact_id: 7, status: "completed", conference_id: conferenceName, conference_ended: true }],
      ["w1", { contact_id: 7, status: "completed", conference_id: conferenceName,
        call_sid: "CA_AGENT", user_id: "u1", campaign_id: 42, outreach_attempt_id: 21 }],
    ]);
  });

  test("a failed signature check stops before provider or database writes", async () => {
    boundary.signature.mockResolvedValue(new Response("forbidden", { status: 403 }));
    expect((await post()).status).toBe(403);
    expect(boundary.createTwilio).not.toHaveBeenCalled();
    expect(boundary.updateCall).not.toHaveBeenCalled();
  });
});
