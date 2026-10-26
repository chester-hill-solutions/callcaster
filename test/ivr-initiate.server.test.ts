import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: "CA123" }));
const findCampaign = vi.hoisted(() => vi.fn());
vi.mock("@/lib/campaign-ivr.server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignInWorkspace: findCampaign,
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: vi.fn().mockResolvedValue({
    calls: { create: twilioCreate },
  }),
  requireWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => "https://example.adminDb.co",
    BETTER_AUTH_SERVICE_KEY: () => "service-key",
    BASE_URL: () => "https://app.example.com",
  },
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/twilio-ivr-runtime.server", () => ({
  resolveIvrCallUrls: vi.fn(() => ({
    url: "https://app.example.com/api/ivr/1/page_1/b1",
    statusCallback: "https://app.example.com/api/ivr/status",
  })),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: vi.fn().mockResolvedValue(99),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: vi.fn().mockResolvedValue(undefined),
}));

describe("initiateIvrCall", () => {
  beforeEach(async () => {
    twilioCreate.mockClear();
    twilioCreate.mockResolvedValue({ sid: "CA123" });
    findCampaign.mockReset().mockResolvedValue({ id: 1, voicemail_drop_enabled: false, voicemail_file: null });
    const workspace = await import("@/lib/database/workspace.server");
    vi.mocked(workspace.createWorkspaceTwilioInstance).mockResolvedValue({ calls: { create: twilioCreate } } as never);
    const rpc = await import("@/lib/db-rpc.server");
    vi.mocked(rpc.rpcCreateOutreachAttempt).mockResolvedValue(99);
    const calls = await import("@/lib/telephony-db.server");
    vi.mocked(calls.insertCallForWorkspace).mockResolvedValue({ id: 1 } as never);
  });

  test("returns call SID when Twilio and RPC succeed", async () => {
    const { initiateIvrCall } = await import("@/lib/ivr-initiate.server");
    const result = await initiateIvrCall({
      user: { id: "user-1" },
      workspace_id: "ws-1",
      campaign_id: 1,
      contact: {
        id: 10,
        contact_id: 20,
        phone: "+15551234567",
        caller_id: "+15559876543",
      },
      user_id: "user-1",
    });
    expect(result).toEqual({ success: true, callSid: "CA123" });
    expect(twilioCreate).toHaveBeenCalledOnce();
  });

  test("the legacy IVR caller also waits for the configured voicemail greeting (#2774)", async () => {
    findCampaign.mockResolvedValueOnce({ id: 1, voicemail_drop_enabled: true, voicemail_file: "drop.mp3" });
    const { initiateIvrCall } = await import("@/lib/ivr-initiate.server");
    const result = await initiateIvrCall({ user: { id: "user-1" }, workspace_id: "ws-1", campaign_id: 1,
      contact: { id: 10, contact_id: 20, phone: "+15551234567", caller_id: "+15559876543" }, user_id: "user-1" });
    expect(result.success).toBe(true);
    expect(findCampaign).toHaveBeenCalledWith("ws-1", 1);
    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ machineDetection: "DetectMessageEnd" }));
  });
});
