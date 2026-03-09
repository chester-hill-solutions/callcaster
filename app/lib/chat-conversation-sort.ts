import type { Database } from "@/lib/database.types";

export type ConversationSummary = NonNullable<
  Database["public"]["Functions"]["get_conversation_summary"]["Returns"][number]
>;

export type ChatSortOption = "recent" | "hasReplied" | "hasUnreadReply";

export function getConversationPhoneKey(phone: string | null): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;

  return digits || null;
}

export function getChatSortOption(value: string | null): ChatSortOption {
  if (value === "hasReplied" || value === "hasUnreadReply") {
    return value;
  }

  return "recent";
}

export function buildRepliedContactKeys(
  rows: Array<{ from: string | null }>,
): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => getConversationPhoneKey(row.from))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function compareByRecentActivity(
  left: ConversationSummary,
  right: ConversationSummary,
): number {
  return (
    new Date(right.conversation_last_update).getTime() -
    new Date(left.conversation_last_update).getTime()
  );
}

export function sortConversationSummaries(
  conversations: ConversationSummary[],
  sortBy: ChatSortOption,
  repliedContactKeys: Set<string>,
): ConversationSummary[] {
  const sortedConversations = [...conversations];

  if (sortBy === "recent") {
    return sortedConversations.sort(compareByRecentActivity);
  }

  if (sortBy === "hasUnreadReply") {
    return sortedConversations.sort((left, right) => {
      const unreadDelta =
        Number(right.unread_count > 0) - Number(left.unread_count > 0);

      if (unreadDelta !== 0) {
        return unreadDelta;
      }

      return compareByRecentActivity(left, right);
    });
  }

  return sortedConversations.sort((left, right) => {
    const leftHasReplied = repliedContactKeys.has(
      getConversationPhoneKey(left.contact_phone) ?? "",
    );
    const rightHasReplied = repliedContactKeys.has(
      getConversationPhoneKey(right.contact_phone) ?? "",
    );
    const repliedDelta = Number(rightHasReplied) - Number(leftHasReplied);

    if (repliedDelta !== 0) {
      return repliedDelta;
    }

    return compareByRecentActivity(left, right);
  });
}
