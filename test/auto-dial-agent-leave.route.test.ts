import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const boundary = vi.hoisted(() => ({
  findCall: vi.fn(), updateCall: vi.fn(), findAttempt: vi.fn(),
  claimStatus: vi.fn(), processStatus: vi.fn(), broadcast: vi.fn(),
  listConferences: vi.fn(), fetchConference: vi.fn(), completeConference: vi.fn(),
  signature: vi.fn(), createTwilio: vi.fn(),
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

const conferenceName = "u1~conference";
const agent = {
  sid: "CA_AGENT", workspace: "w1", conference_id: conferenceName,
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
    boundary.processStatus.mockResolvedValue({ call: { ...agent, status: "completed", contact_id: 7, outreach_attempt_id: 21 } });
    expect((await post({ StatusCallbackEvent: null, ReasonParticipantLeft: null, CallStatus: "completed", CallDuration: "42" })).status).toBe(200);
    expect(boundary.claimStatus).toHaveBeenCalledWith("w1", "CA_AGENT", "completed");
    expect(boundary.processStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", duration: "42" }),
      expect.objectContaining({ outreachAttemptId: 21, contactId: 7 }));
    expect(boundary.broadcast.mock.calls).toEqual([
      ["w1", { contact_id: 7, status: "completed", conference_id: conferenceName, conference_ended: true }],
      ["w1", { contact_id: 7, status: "completed", conference_id: conferenceName }],
    ]);
  });

  test("a failed signature check stops before provider or database writes", async () => {
    boundary.signature.mockResolvedValue(new Response("forbidden", { status: 403 }));
    expect((await post()).status).toBe(403);
    expect(boundary.createTwilio).not.toHaveBeenCalled();
    expect(boundary.updateCall).not.toHaveBeenCalled();
  });
});
