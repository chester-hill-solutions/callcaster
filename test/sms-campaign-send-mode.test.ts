import { describe, expect, test } from "vitest";
import {
  MESSAGING_SERVICE_SENDER_VALUE,
  parseChatSenderSelection,
  workspaceMessagingServiceHasAvailableSenders,
} from "../app/lib/sms-campaign-send-mode";

describe("parseChatSenderSelection", () => {
  test("treats the sentinel as a Messaging Service send when it is available", () => {
    expect(
      parseChatSenderSelection({
        rawFrom: MESSAGING_SERVICE_SENDER_VALUE,
        messagingServiceAvailable: true,
      }),
    ).toEqual({ mode: "messaging_service", fromNumber: "" });
  });

  test("treats a chosen number as a from_number send even when a Messaging Service exists", () => {
    // The workspace default must not silently override an explicit pick.
    expect(
      parseChatSenderSelection({
        rawFrom: "+15551230001",
        messagingServiceAvailable: true,
      }),
    ).toEqual({ mode: "from_number", fromNumber: "+15551230001" });
  });

  test("falls back to from_number when a stale sentinel arrives and the service is gone", () => {
    expect(
      parseChatSenderSelection({
        rawFrom: MESSAGING_SERVICE_SENDER_VALUE,
        messagingServiceAvailable: false,
      }),
    ).toEqual({ mode: "from_number", fromNumber: "" });
  });

  test.each([[null], [undefined], [""], ["   "]])(
    "falls back to the workspace Messaging Service when %p is sent as from",
    (rawFrom) => {
      // Omitting `from` is not an explicit choice — API callers never send it.
      expect(
        parseChatSenderSelection({ rawFrom, messagingServiceAvailable: true }),
      ).toEqual({ mode: "messaging_service", fromNumber: "" });
    },
  );

  test.each([[null], [undefined], [""], ["   "]])(
    "treats %p as an empty from_number selection with no Messaging Service",
    (rawFrom) => {
      expect(
        parseChatSenderSelection({ rawFrom, messagingServiceAvailable: false }),
      ).toEqual({ mode: "from_number", fromNumber: "" });
    },
  );

  test("trims surrounding whitespace from a chosen number", () => {
    expect(
      parseChatSenderSelection({
        rawFrom: "  +15551230001  ",
        messagingServiceAvailable: true,
      }),
    ).toEqual({ mode: "from_number", fromNumber: "+15551230001" });
  });
});

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
