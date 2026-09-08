import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BASE_URL ??= "https://app.example.test";
});

const mocks = vi.hoisted(() => ({
  requireOutboundCredits: vi.fn(),
  findFirst: vi.fn(),
  findContactsByPhone: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  callsCreate: vi.fn(),
  insertCallForWorkspace: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/outbound-credit-gate.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-credit-gate.server")>()),
  requireOutboundCredits: (...args: unknown[]) => mocks.requireOutboundCredits(...args),
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({ campaign: { findFirst: mocks.findFirst } }),
}));
vi.mock("@/lib/database/contact.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/contact.server")>()),
  findContactsByPhone: (...args: unknown[]) => mocks.findContactsByPhone(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/twilio-client.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-client.server")>()),
  withTwilioRetry: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  insertCallForWorkspace: (...args: unknown[]) => mocks.insertCallForWorkspace(...args),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

const campaign = (overrides: Record<string, unknown> = {}) => ({
  id: 99,
  type: "simple_ivr",
  caller_id: "+15555550100",
  script_id: 7,
  ...overrides,
});

const baseArgs = { workspaceId: "w1", campaignId: 99, userId: "u1", to: "(613) 555-0199" };

describe("sendCampaignTestCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.findFirst.mockResolvedValue(campaign());
    mocks.findContactsByPhone.mockResolvedValue([]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      calls: { create: mocks.callsCreate },
    });
    mocks.callsCreate.mockResolvedValue({ sid: "CA123" });
    mocks.insertCallForWorkspace.mockResolvedValue({ sid: "CA123" });
  });

  test("places the call through the campaign's IVR flow with no outreach attempt", async () => {
    const { sendCampaignTestCall } = await import("@/lib/campaign-test-call.server");
    const result = await sendCampaignTestCall(baseArgs);

    expect(result).toEqual({ ok: true, to: "+16135550199", callSid: "CA123", usedContact: false });
    expect(mocks.callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+16135550199",
        from: "+15555550100",
        url: expect.stringMatching(/\/api\/ivr\/99\/page_1\/$/),
        statusCallback: expect.stringMatching(/\/api\/ivr\/status$/),
        machineDetection: "Enable",
      }),
    );
    expect(mocks.insertCallForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        sid: "CA123",
        campaign_id: 99,
        contact_id: null,
        outreach_attempt_id: null,
      }),
    );
  });

  test("records the matching workspace contact on the call row", async () => {
    mocks.findContactsByPhone.mockResolvedValue([{ id: 7 }]);
    const { sendCampaignTestCall } = await import("@/lib/campaign-test-call.server");
    const result = await sendCampaignTestCall(baseArgs);
    expect(result).toMatchObject({ ok: true, usedContact: true });
    expect(mocks.insertCallForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ contact_id: 7, outreach_attempt_id: null }),
    );
  });

  test.each([
    ["invalid_phone", { to: "nope" }, {}],
    ["insufficient_credits", {}, { credits: { ok: false, reason: "insufficient_credits" } }],
    ["not_found", {}, { campaign: null }],
    ["unsupported_type", {}, { campaign: campaign({ type: "message" }) }],
    ["unsupported_type", {}, { campaign: campaign({ type: "live_call" }) }],
    ["caller_id_required", {}, { campaign: campaign({ caller_id: " " }) }],
    ["no_script", {}, { campaign: campaign({ script_id: null }) }],
  ] as const)("fails closed with %s", async (reason, argOverrides, setup) => {
    if ("credits" in setup) mocks.requireOutboundCredits.mockResolvedValue(setup.credits);
    if ("campaign" in setup) mocks.findFirst.mockResolvedValue(setup.campaign);
    const { sendCampaignTestCall } = await import("@/lib/campaign-test-call.server");

    const result = await sendCampaignTestCall({ ...baseArgs, ...argOverrides });

    expect(result).toMatchObject({ ok: false, reason });
    expect(mocks.callsCreate).not.toHaveBeenCalled();
  });

  test("reports a Twilio failure as call_failed", async () => {
    mocks.callsCreate.mockRejectedValue(new Error("Twilio rejected the number"));
    const { sendCampaignTestCall } = await import("@/lib/campaign-test-call.server");
    const result = await sendCampaignTestCall(baseArgs);
    expect(result).toMatchObject({ ok: false, reason: "call_failed" });
    expect(mocks.insertCallForWorkspace).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "campaign.test_call_failed",
      expect.objectContaining({ campaignId: "99" }),
    );
  });
});
