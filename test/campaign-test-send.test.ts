import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOutboundCredits: vi.fn(),
  loadCampaignSmsDispatchData: vi.fn(),
  findContactsByPhone: vi.fn(),
  isOptedOutRecipient: vi.fn(),
  createSignedObjectUrl: vi.fn(),
  sendMessage: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/outbound-credit-gate.server", () => ({
  requireOutboundCredits: (...args: unknown[]) => mocks.requireOutboundCredits(...args),
}));
vi.mock("@/lib/sms-campaign-db.server", () => ({
  loadCampaignSmsDispatchData: (...args: unknown[]) =>
    mocks.loadCampaignSmsDispatchData(...args),
}));
vi.mock("@/lib/database/contact.server", () => ({
  findContactsByPhone: (...args: unknown[]) => mocks.findContactsByPhone(...args),
}));
vi.mock("@/lib/chat-sms-guards.server", () => ({
  isOptedOutRecipient: (...args: unknown[]) => mocks.isOptedOutRecipient(...args),
}));
vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/chat-sms.server", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

const campaign = (overrides: Partial<{
  body_text: string;
  message_media: string[];
  sms_send_mode: string | null;
  caller_id: string | null;
}> = {}) => ({
  body_text: overrides.body_text ?? 'Hi {{firstname|"there"}}, from {{city}}',
  message_media: overrides.message_media ?? [],
  campaign: {
    end_time: "",
    sms_send_mode: overrides.sms_send_mode ?? "from_number",
    sms_messaging_service_sid: null,
    caller_id: overrides.caller_id === undefined ? "+15555550100" : overrides.caller_id,
    sms_send_window: null,
  },
});

const baseArgs = {
  workspaceId: "w1",
  campaignId: 99,
  userId: "u1",
  to: "(613) 555-0199",
};

describe("sendCampaignTestSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(campaign());
    mocks.findContactsByPhone.mockResolvedValue([]);
    mocks.isOptedOutRecipient.mockResolvedValue(false);
    mocks.createSignedObjectUrl.mockImplementation(async (_b: string, key: string) => `https://cdn/${key}`);
    mocks.sendMessage.mockResolvedValue({ message: { sid: "SM123" }, data: null });
  });

  test("renders the sample contact and sends through the chat sender", async () => {
    const { sendCampaignTestSms } = await import("@/lib/campaign-test-send.server");
    const result = await sendCampaignTestSms(baseArgs);

    expect(result).toEqual({
      ok: true,
      to: "+16135550199",
      sid: "SM123",
      body: "Hi Jordan, from Ottawa",
      usedSampleContact: true,
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Hi Jordan, from Ottawa",
        to: "+16135550199",
        from: "+15555550100",
        media: "",
        workspace: "w1",
        contact_id: "",
        user: { id: "u1" },
        sendMode: "from_number",
      }),
    );
    expect(mocks.sendMessage.mock.calls[0]?.[0]).not.toHaveProperty("campaign_id");
  });

  test("renders against the matching workspace contact and attaches campaign media", async () => {
    mocks.findContactsByPhone.mockResolvedValue([{ id: 7, firstname: "Ada", city: "" }]);
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(
      campaign({ message_media: ["a.png", "b.png"] }),
    );
    const { sendCampaignTestSms } = await import("@/lib/campaign-test-send.server");
    const result = await sendCampaignTestSms(baseArgs);

    expect(result).toMatchObject({ ok: true, body: "Hi Ada, from ", usedSampleContact: false });
    expect(mocks.isOptedOutRecipient).toHaveBeenCalledWith("w1", "+16135550199", "7");
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: "7",
        media: JSON.stringify(["https://cdn/w1/a.png", "https://cdn/w1/b.png"]),
      }),
    );
  });

  test.each([
    ["invalid_phone", { to: "not a number" }, {}],
    ["insufficient_credits", {}, { credits: { ok: false, reason: "insufficient_credits" } }],
    ["empty_message", {}, { campaign: campaign({ body_text: "  " }) }],
    ["caller_id_required", {}, { campaign: campaign({ caller_id: null }) }],
    ["opted_out", {}, { optedOut: true }],
  ] as const)("fails closed with %s", async (reason, argOverrides, setup) => {
    if ("credits" in setup) mocks.requireOutboundCredits.mockResolvedValue(setup.credits);
    if ("campaign" in setup) mocks.loadCampaignSmsDispatchData.mockResolvedValue(setup.campaign);
    if ("optedOut" in setup) mocks.isOptedOutRecipient.mockResolvedValue(true);
    const { sendCampaignTestSms } = await import("@/lib/campaign-test-send.server");

    const result = await sendCampaignTestSms({ ...baseArgs, ...argOverrides });

    expect(result).toMatchObject({ ok: false, reason });
    expect((result as { message: string }).message).toBeTruthy();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("sends media-only campaigns with a blank body", async () => {
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(
      campaign({ body_text: "", message_media: ["a.png"] }),
    );
    const { sendCampaignTestSms } = await import("@/lib/campaign-test-send.server");
    const result = await sendCampaignTestSms(baseArgs);
    expect(result).toMatchObject({ ok: true, body: " " });
  });

  test("reports a sender failure as send_failed with the user-facing message", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Twilio rejected the number"));
    const { sendCampaignTestSms } = await import("@/lib/campaign-test-send.server");
    const result = await sendCampaignTestSms(baseArgs);
    expect(result).toMatchObject({ ok: false, reason: "send_failed" });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "campaign.test_send_failed",
      expect.objectContaining({ campaignId: "99" }),
    );
  });
});
