import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const twilioMocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(async () => (null)),
}));

const telephonyMocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(async () => null),
  upsertCallBySid: vi.fn(async () => ({ id: "CA_TERM", workspace: "w1", outreach_attempt_id: 123 })),
  findOutreachAttemptWithCampaignType: vi.fn(async () => ({
    id: 123,
    disposition: "completed",
    contact_id: 1,
    workspace: "w1",
  })),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ id: 123 })),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: twilioMocks.requireTwilioSignature,
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: telephonyMocks.findCallBySid,
  upsertCallBySid: telephonyMocks.upsertCallBySid,
  findOutreachAttemptWithCampaignType: telephonyMocks.findOutreachAttemptWithCampaignType,
  updateOutreachAttemptForWorkspace: telephonyMocks.updateOutreachAttemptForWorkspace,
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: vi.fn(async () => ({ data: { id: 1 }, error: null })),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  emitPredictiveBroadcast: vi.fn(async () => ({})),
}));

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: vi.fn(async () => ({ enqueued: true, jobId: 1 })),
}));

describe("outreach disposition transitions", () => {
  beforeEach(() => {
    vi.resetModules();
    twilioMocks.requireTwilioSignature.mockReset();
    twilioMocks.requireTwilioSignature.mockResolvedValue(null);
    Object.values(telephonyMocks).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    telephonyMocks.findCallBySid.mockResolvedValue(null);
    telephonyMocks.upsertCallBySid.mockResolvedValue({ id: "CA_TERM", workspace: "w1", outreach_attempt_id: 123 });
    telephonyMocks.findOutreachAttemptWithCampaignType.mockResolvedValue({
      id: 123,
      disposition: "completed",
      contact_id: 1,
      workspace: "w1",
    });
    telephonyMocks.updateOutreachAttemptForWorkspace.mockResolvedValue({ id: 123 });
  });

  test("api.call-status does not overwrite terminal disposition with a different value", async () => {
    const mod = await import("../app/routes/api+/call-status");
    const fd = new FormData();
    fd.set("CallSid", "CA_TERM");
    fd.set("CallStatus", "ringing");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "0");
    const req = new Request("http://localhost/api/call-status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    const res = await asRouteResponse(mod.action({ request: req } as any));
    expect(res.status).toBe(200);
    expect(telephonyMocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });
});
