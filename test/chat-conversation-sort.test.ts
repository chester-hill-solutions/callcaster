import { describe, expect, test } from "vitest";

import {
  buildRepliedContactKeys,
  getChatSortOption,
  getConversationParticipantPhones,
  getConversationPhoneKey,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "../app/lib/chat-conversation-sort";

function createConversation(
  overrides: Partial<ConversationSummary>,
): ConversationSummary {
  return {
    contact_phone: "+15550000000",
    user_phone: "+15551111111",
    conversation_start: "2026-03-01T00:00:00.000Z",
    conversation_last_update: "2026-03-01T00:00:00.000Z",
    message_count: 1,
    unread_count: 0,
    contact_firstname: "Test",
    contact_surname: "User",
    ...overrides,
  };
}

describe("chat conversation sorting", () => {
  test("filters out unreplied conversations for hasReplied", () => {
    const conversations = [
      createConversation({
        contact_phone: "+15550000001",
        conversation_last_update: "2026-03-02T00:00:00.000Z",
      }),
      createConversation({
        contact_phone: "+15550000002",
        conversation_last_update: "2026-03-01T00:00:00.000Z",
      }),
    ];

    const repliedContactKeys = new Set(
      buildRepliedContactKeys([{ from: "+1 (555) 000-0002" }]),
    );

    expect(
      sortConversationSummaries(
        conversations,
        "hasReplied",
        repliedContactKeys,
      ).map((conversation) => conversation.contact_phone),
    ).toEqual(["+15550000002"]);
  });

  test("filters out conversations without unread replies for hasUnreadReply", () => {
    const conversations = [
      createConversation({
        contact_phone: "+15550000001",
        unread_count: 0,
        conversation_last_update: "2026-03-03T00:00:00.000Z",
      }),
      createConversation({
        contact_phone: "+15550000002",
        unread_count: 2,
        conversation_last_update: "2026-03-01T00:00:00.000Z",
      }),
    ];

    expect(
      sortConversationSummaries(conversations, "hasUnreadReply", new Set()).map(
        (conversation) => conversation.contact_phone,
      ),
    ).toEqual(["+15550000002"]);
  });

  test("falls back to recent activity within the same sort bucket", () => {
    const conversations = [
      createConversation({
        contact_phone: "+15550000001",
        unread_count: 1,
        conversation_last_update: "2026-03-03T00:00:00.000Z",
      }),
      createConversation({
        contact_phone: "+15550000002",
        unread_count: 1,
        conversation_last_update: "2026-03-04T00:00:00.000Z",
      }),
    ];

    expect(
      sortConversationSummaries(conversations, "hasUnreadReply", new Set()).map(
        (conversation) => conversation.contact_phone,
      ),
    ).toEqual(["+15550000002", "+15550000001"]);
  });

  test("falls back to recent activity when hasReplied ties", () => {
    const conversations = [
      createConversation({
        contact_phone: "+15550000001",
        has_replied: true,
        conversation_last_update: "2026-03-03T00:00:00.000Z",
      }),
      createConversation({
        contact_phone: "+15550000002",
        has_replied: true,
        conversation_last_update: "2026-03-04T00:00:00.000Z",
      }),
    ];

    expect(
      sortConversationSummaries(conversations, "hasReplied", new Set()).map(
        (conversation) => conversation.contact_phone,
      ),
    ).toEqual(["+15550000002", "+15550000001"]);
  });

  test("normalizes and keys phone numbers across formats", () => {
    expect(normalizeConversationPhone(null)).toBeNull();
    expect(normalizeConversationPhone("not-a-number")).toBeNull();
    expect(normalizeConversationPhone("5550000000")).toBe("+15550000000");
    expect(normalizeConversationPhone("15550000000")).toBe("+15550000000");
    expect(normalizeConversationPhone("+447700900123")).toBe("+447700900123");
    expect(normalizeConversationPhone("447700900123")).toBe("+447700900123");
    expect(getConversationPhoneKey("(555) 000-0000")).toBe("15550000000");
    expect(getConversationPhoneKey("+447700900123")).toBe("447700900123");
    expect(getConversationPhoneKey(null)).toBeNull();
  });

  test("excludes unreplied rows when contact keys cannot be normalized", () => {
    const conversations = [
      createConversation({
        contact_phone: "not-a-number" as any,
        conversation_last_update: "2026-03-04T00:00:00.000Z",
      }),
      createConversation({
        contact_phone: "+15550000002",
        has_replied: true,
        conversation_last_update: "2026-03-03T00:00:00.000Z",
      }),
    ];

    expect(
      sortConversationSummaries(conversations, "hasReplied", new Set()).map(
        (conversation) => conversation.contact_phone,
      ),
    ).toEqual(["+15550000002"]);
  });

  test("detects participant roles from workspace phones and direction", () => {
    const workspacePhoneKeys = new Set(["15551111111"]);

    expect(
      getConversationParticipantPhones(
        { from: "+15551111111", to: "+15550000000", direction: "outbound" },
        workspacePhoneKeys,
      ),
    ).toEqual({ contactPhone: "+15550000000", userPhone: "+15551111111" });

    expect(
      getConversationParticipantPhones(
        { from: "+15550000000", to: "+15551111111", direction: "inbound" },
        workspacePhoneKeys,
      ),
    ).toEqual({ contactPhone: "+15550000000", userPhone: "+15551111111" });

    expect(
      getConversationParticipantPhones(
        { from: "+15550000000", to: "+15552222222", direction: "inbound" },
        new Set(),
      ),
    ).toEqual({ contactPhone: "+15550000000", userPhone: "+15552222222" });

    expect(
      getConversationParticipantPhones(
        { from: "+15550000000", to: "+15552222222", direction: "outbound-api" },
        new Set(),
      ),
    ).toEqual({ contactPhone: "+15552222222", userPhone: "+15550000000" });
  });

  test("isInboundMessageDirection is true only for inbound", () => {
    expect(isInboundMessageDirection("inbound")).toBe(true);
    expect(isInboundMessageDirection("outbound-reply")).toBe(false);
    expect(isInboundMessageDirection(null)).toBe(false);
  });

  test("normalizes sort option values", () => {
    expect(getChatSortOption("hasReplied")).toBe("hasReplied");
    expect(getChatSortOption("hasUnreadReply")).toBe("hasUnreadReply");
    expect(getChatSortOption("recent")).toBe("recent");
    expect(getChatSortOption("other")).toBe("recent");
    expect(getChatSortOption(null)).toBe("recent");
  });
});
