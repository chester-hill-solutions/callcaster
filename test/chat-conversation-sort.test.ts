import { describe, expect, test } from "vitest";

import {
  buildRepliedContactKeys,
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
  test("sorts replied conversations ahead of unreplied conversations", () => {
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
      sortConversationSummaries(conversations, "hasReplied", repliedContactKeys).map(
        (conversation) => conversation.contact_phone,
      ),
    ).toEqual(["+15550000002", "+15550000001"]);
  });

  test("sorts unread replies ahead of read conversations", () => {
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
    ).toEqual(["+15550000002", "+15550000001"]);
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
});
