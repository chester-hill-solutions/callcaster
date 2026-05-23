import { describe, expect, test } from "vitest";
import { workspaceMessagingServiceHasAvailableSenders } from "../app/lib/sms-campaign-send-mode";

describe("app/lib/sms-campaign-send-mode.ts", () => {
  test("returns false without messaging service SID", () => {
    expect(
      workspaceMessagingServiceHasAvailableSenders({
        messagingServiceSid: null,
        attachedSenderPhoneNumbers: ["+15551230001"],
        workspaceNumbers: [{ phone_number: "+15551230001", capabilities: { sms: true } }],
      }),
    ).toBe(false);
  });

  test("returns true when SID exists and onboarding lists attached senders", () => {
    expect(
      workspaceMessagingServiceHasAvailableSenders({
        messagingServiceSid: "MG123",
        attachedSenderPhoneNumbers: ["+15551230001"],
        workspaceNumbers: [],
      }),
    ).toBe(true);
  });

  test("returns true when SID exists and workspace has SMS-capable number (no attached list)", () => {
    expect(
      workspaceMessagingServiceHasAvailableSenders({
        messagingServiceSid: "MG123",
        attachedSenderPhoneNumbers: [],
        workspaceNumbers: [{ phone_number: "+15551230001", capabilities: { sms: true } }],
      }),
    ).toBe(true);
  });

  test("returns false when SID exists but no senders and no SMS-capable numbers", () => {
    expect(
      workspaceMessagingServiceHasAvailableSenders({
        messagingServiceSid: "MG123",
        attachedSenderPhoneNumbers: [],
        workspaceNumbers: [{ phone_number: "+15551230001", capabilities: { voice: true } }],
      }),
    ).toBe(false);
  });
});
