import { describe, expect, test, vi } from "vitest";

const performanceReads = vi.hoisted(() => ({
  comparisonCalls: 0,
  phoneKeyReads: 0,
}));

vi.mock("@/lib/chat-conversation-sort", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat-conversation-sort")>();
  return {
    ...original,
    getConversationPhoneKey: (...args: Parameters<typeof original.getConversationPhoneKey>) => {
      performanceReads.phoneKeyReads += 1;
      return original.getConversationPhoneKey(...args);
    },
  };
});

import type { ConversationSummary } from "../app/lib/chat-conversation-sort";
import {
  ALL_CAMPAIGNS_VALUE,
  getWorkspacePhoneKeys,
  mergeConversationPages,
  phoneRegex,
  upsertConversationFromMessage,
} from "../app/lib/chats/conversation-utils";

vi.mock("@/hooks/realtime/useChatRealtime", () => ({
  phoneNumbersMatch: (a: string | null, b: string | null) => {
    performanceReads.comparisonCalls += 1;
    if (!a || !b) return false;
    return a.replace(/\D/g, "") === b.replace(/\D/g, "");
  },
}));

function createConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    contact_phone: "+15550000001",
    user_phone: "+15551111111",
    conversation_start: "2026-03-01T00:00:00.000Z",
    conversation_last_update: "2026-03-01T00:00:00.000Z",
    message_count: 1,
    unread_count: 0,
    contact_firstname: null,
    contact_surname: null,
    has_replied: false,
    ...overrides,
  };
}

describe("conversation-utils", () => {
  test("ALL_CAMPAIGNS_VALUE is all", () => {
    expect(ALL_CAMPAIGNS_VALUE).toBe("all");
  });

  test("phoneRegex matches common formats", () => {
    expect(phoneRegex.test("+1 (555) 123-4567")).toBe(true);
    expect(phoneRegex.test("not-a-phone")).toBe(false);
  });

  test("mergeConversationPages merges by phone and appends new", () => {
    const current = [createConversation({ contact_phone: "+15550000001", message_count: 1 })];
    const next = [
      createConversation({ contact_phone: "+15550000001", message_count: 5 }),
      createConversation({ contact_phone: "+15550000002", message_count: 2 }),
    ];

    const merged = mergeConversationPages(current, next);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.message_count).toBe(5);
    expect(merged[1]?.contact_phone).toBe("+15550000002");
  });

  test("mergeConversationPages treats formatted versions of one phone as one conversation", () => {
    const merged = mergeConversationPages(
      [createConversation({ contact_phone: "+15550000001", message_count: 1 })],
      [createConversation({ contact_phone: "1 (555) 000-0001", message_count: 5 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.message_count).toBe(5);
  });

  test("merges 1,000 refreshed conversations in linear phone-key reads", () => {
    const current = Array.from({ length: 1_000 }, (_, index) =>
      createConversation({
        contact_phone: `+1555${String(index).padStart(7, "0")}`,
        message_count: 1,
      }),
    );
    const next = current.map((conversation) => ({
      ...conversation,
      message_count: 2,
    }));
    performanceReads.comparisonCalls = 0;
    performanceReads.phoneKeyReads = 0;

    const merged = mergeConversationPages(current, next);

    expect(merged).toHaveLength(1_000);
    expect(merged[999]?.message_count).toBe(2);
    expect(performanceReads.phoneKeyReads).toBe(2_000);
    expect(performanceReads.comparisonCalls).toBeLessThanOrEqual(2_000);
  });

  test("getWorkspacePhoneKeys normalizes workspace numbers", () => {
    const keys = getWorkspacePhoneKeys([
      { phone_number: "+1 (555) 111-2222" } as never,
      { phone_number: null } as never,
    ]);
    expect(keys.has("15551112222")).toBe(true);
  });

  test("upsertConversationFromMessage returns current when contact phone missing", () => {
    const current = [createConversation()];
    const result = upsertConversationFromMessage({
      currentChats: current,
      message: {
        from: "",
        to: "",
        direction: "outbound",
      } as never,
      workspacePhoneKeys: new Set(["15551111111"]),
    });
    expect(result).toBe(current);
  });

  test("upsertConversationFromMessage appends new conversation", () => {
    const workspacePhoneKeys = new Set(["15551111111"]);
    const result = upsertConversationFromMessage({
      currentChats: [],
      message: {
        from: "+15550000099",
        to: "+15551111111",
        direction: "inbound",
        date_created: "2026-03-02T00:00:00.000Z",
        status: "received",
      } as never,
      workspacePhoneKeys,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.contact_phone).toBe("+15550000099");
    expect(result[0]?.unread_count).toBe(1);
    expect(result[0]?.has_replied).toBe(true);
  });

  test("upsertConversationFromMessage updates existing conversation", () => {
    const workspacePhoneKeys = new Set(["15551111111"]);
    const current = [
      createConversation({
        contact_phone: "+15550000099",
        message_count: 2,
        unread_count: 1,
        conversation_last_update: "2026-03-01T00:00:00.000Z",
        has_replied: false,
      }),
    ];

    const result = upsertConversationFromMessage({
      currentChats: current,
      message: {
        from: "+15550000099",
        to: "+15551111111",
        direction: "outbound",
        date_created: "2026-03-03T00:00:00.000Z",
        status: "sent",
      } as never,
      workspacePhoneKeys,
      activeContactNumber: "+15550000099",
    });

    expect(result[0]?.message_count).toBe(3);
    expect(result[0]?.unread_count).toBe(1);
    expect(result[0]?.conversation_last_update).toBe("2026-03-03T00:00:00.000Z");
  });

  test("upsertConversationFromMessage keeps newer last update timestamp", () => {
    const workspacePhoneKeys = new Set(["15551111111"]);
    const current = [
      createConversation({
        contact_phone: "+15550000099",
        conversation_last_update: "2026-03-05T00:00:00.000Z",
      }),
    ];

    const result = upsertConversationFromMessage({
      currentChats: current,
      message: {
        from: "+15550000099",
        to: "+15551111111",
        direction: "inbound",
        date_created: "2026-03-02T00:00:00.000Z",
        status: "received",
      } as never,
      workspacePhoneKeys,
    });

    expect(result[0]?.conversation_last_update).toBe("2026-03-05T00:00:00.000Z");
  });
});
