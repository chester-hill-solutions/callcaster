import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";
import { TEST_WORKSPACE_ID } from "./helpers/public-api-fixtures";

const mocks = vi.hoisted(() => ({
  verifyApiKeyOrSession: vi.fn(),
  parseJsonBodyOrResponse: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspaceCreditsBalance: vi.fn(async () => 100),
  loadCampaignSmsDispatchData: vi.fn(),
  getCampaignQueueById: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  dequeueCampaignQueueById: vi.fn(async () => undefined),
  countCampaignMessagesToPhone: vi.fn(async () => 0),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ campaign_id: 1 })),
  rpcCreateOutreachAttempt: vi.fn(async () => 1),
  persistMessageRecord: vi.fn(async () => ({ data: [{ id: 1 }], error: null })),
  createSignedObjectUrl: vi.fn(async (bucket: string, key: string) => `signed:${key}`),
  getOrLookupLineType: vi.fn(async () => null as string | null),
  logger: { error: vi.fn() },
  env: { BASE_URL: () => "https://app.example" },
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

vi.mock("@/lib/capability-guard.server", () => ({
  requireDualAuthCapability: async () => ({ type: "ok" }),
  requireDataPlaneCapability: async () => ({ type: "ok" }),
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: unknown[]) => mocks.verifyApiKeyOrSession(...args),
}));
vi.mock("@/lib/api-parse.server", () => ({
  parseJsonBodyOrResponse: (...args: unknown[]) => mocks.parseJsonBodyOrResponse(...args),
}));
vi.mock("@/lib/database/campaign.server", () => ({
  getCampaignQueueById: (...args: unknown[]) =>
    mocks.getCampaignQueueById(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) =>
    mocks.getWorkspaceTwilioPortalConfig(...args),
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueCampaignQueueById: (...args: unknown[]) => mocks.dequeueCampaignQueueById(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  countCampaignMessagesToPhone: (...args: unknown[]) =>
    mocks.countCampaignMessagesToPhone(...args),
}));
vi.mock("@/lib/sms-campaign-db.server", () => ({
  loadCampaignSmsDispatchData: (...args: unknown[]) =>
    mocks.loadCampaignSmsDispatchData(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  updateOutreachAttemptForWorkspace: (...args: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/twilio-readiness.server", () => ({
  assertWorkspaceCanSendSms: vi.fn(async () => undefined),
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/sms-send.server", () => ({
  persistMessageRecord: (...args: unknown[]) => mocks.persistMessageRecord(...args),
  twilioMessageToPersistFields: (message: any, extras: any) => ({ ...message, ...extras }),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...args: unknown[]) => mocks.rpcCreateOutreachAttempt(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: unknown[]) => mocks.getWorkspaceCreditsBalance(...args),
}));
vi.mock("@/lib/twilio-lookup.server", () => ({
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: (lineType: string | null | undefined) =>
    lineType === "landline" || lineType === "fax",
}));

const basePortal = makePortalConfig();

function baseCampaignData() {
  return {
    campaign: { end_date: null, sms_send_mode: null },
    body_text: "Hello {{firstname}}",
    message_media: [],
  };
}

describe("app/routes/api+/sms.action.server.ts (campaign SMS dispatch)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as any).mockReset?.();
      }
    }
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(100);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      ...basePortal,
      parallelDispatchEnabled: false,
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      messages: { create: vi.fn(async (args: any) => ({ sid: "SM1", ...args })) },
    });
    mocks.dequeueCampaignQueueById.mockResolvedValue(undefined);
    mocks.countCampaignMessagesToPhone.mockResolvedValue(0);
    mocks.updateOutreachAttemptForWorkspace.mockResolvedValue({ campaign_id: 1 });
    mocks.rpcCreateOutreachAttempt.mockResolvedValue(1);
    mocks.persistMessageRecord.mockResolvedValue({ data: [{ id: 1 }], error: null });
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.logger.error.mockClear();
  });

  test("skips and dequeues opted-out contacts without sending", async () => {
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 501,
        contact_id: 9,
        contact: { id: 9, phone: "+15551234567", firstname: "A", opt_out: true },
      },
    ]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      campaign_id: "1",
      workspace_id: TEST_WORKSPACE_ID,
      caller_id: "+15550000000",
    });

    const mod = await import("../app/routes/api+/sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { responses: Array<Record<string, any>> };
    expect(body.responses[0]).toEqual({
      9: { success: true, skipped: true, reason: "Contact opted out" },
    });
    expect(mocks.dequeueCampaignQueueById).toHaveBeenCalledWith({
      queueId: 501,
      userId: "u1",
      reason: "Contact opted out",
    });
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test("sends normally for a non-opted-out contact", async () => {
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 502,
        contact_id: 10,
        contact: { id: 10, phone: "+15557654321", firstname: "B", opt_out: false },
      },
    ]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      campaign_id: "1",
      workspace_id: TEST_WORKSPACE_ID,
      caller_id: "+15550000000",
    });

    const mod = await import("../app/routes/api+/sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { responses: Array<Record<string, any>> };
    expect(body.responses[0][10]).toMatchObject({ success: true });
    expect(mocks.dequeueCampaignQueueById).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "SMS message sent" }),
    );
  });

  test("skips and dequeues landline contacts without sending", async () => {
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 503,
        contact_id: 11,
        contact: { id: 11, phone: "+15551112222", firstname: "C", opt_out: false },
      },
    ]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      campaign_id: "1",
      workspace_id: TEST_WORKSPACE_ID,
      caller_id: "+15550000000",
    });
    mocks.getOrLookupLineType.mockResolvedValueOnce("landline");

    const mod = await import("../app/routes/api+/sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { responses: Array<Record<string, any>> };
    expect(body.responses[0]).toEqual({
      11: { success: true, skipped: true, reason: "Landline — cannot receive SMS" },
    });
    expect(mocks.dequeueCampaignQueueById).toHaveBeenCalledWith({
      queueId: 503,
      userId: "u1",
      reason: "Landline — cannot receive SMS",
    });
    expect(mocks.getOrLookupLineType).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: TEST_WORKSPACE_ID,
        contactId: 11,
        phone: "+15551112222",
      }),
    );
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });

  test.each(["mobile", "voip", null])(
    "sends normally when the line type is %s (only landline is skipped)",
    async (lineType) => {
      mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
      mocks.getCampaignQueueById.mockResolvedValue([
        {
          id: 504,
          contact_id: 12,
          contact: { id: 12, phone: "+15553334444", firstname: "D", opt_out: false },
        },
      ]);
      mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
        campaign_id: "1",
        workspace_id: TEST_WORKSPACE_ID,
        caller_id: "+15550000000",
      });
      mocks.getOrLookupLineType.mockResolvedValueOnce(lineType);

      const mod = await import("../app/routes/api+/sms.action.server");
      const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { responses: Array<Record<string, any>> };
      expect(body.responses[0][12]).toMatchObject({ success: true });
      expect(mocks.dequeueCampaignQueueById).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "SMS message sent" }),
      );
    },
  );

  test("opted-out gate takes priority over the landline gate", async () => {
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 505,
        contact_id: 13,
        contact: { id: 13, phone: "+15555556666", firstname: "E", opt_out: true },
      },
    ]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      campaign_id: "1",
      workspace_id: TEST_WORKSPACE_ID,
      caller_id: "+15550000000",
    });

    const mod = await import("../app/routes/api+/sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { responses: Array<Record<string, any>> };
    expect(body.responses[0]).toEqual({
      13: { success: true, skipped: true, reason: "Contact opted out" },
    });
    expect(mocks.getOrLookupLineType).not.toHaveBeenCalled();
  });
});
