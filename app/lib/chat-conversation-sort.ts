export type ConversationSummary = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
  contact_firstname: string | null;
  contact_surname: string | null;
  has_replied?: boolean;
};

type ConversationMessageLike = {
  from: string | null;
  to: string | null;
  direction: string | null;
};

export type ChatSortOption = "recent" | "hasReplied" | "hasUnreadReply";

export function normalizeConversationPhone(phone: string | null): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return phone.startsWith("+") ? phone : `+${digits}`;
}

export function getConversationPhoneKey(phone: string | null): string | null {
  const normalizedPhone = normalizeConversationPhone(phone);
  if (!normalizedPhone) return null;

  const digits = normalizedPhone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;

  return digits || null;
}

export function getConversationParticipantPhones(
  message: ConversationMessageLike,
  workspacePhoneKeys: Set<string>,
): {
  contactPhone: string | null;
  userPhone: string | null;
} {
  const fromKey = getConversationPhoneKey(message.from);
  const toKey = getConversationPhoneKey(message.to);

  if (fromKey && workspacePhoneKeys.has(fromKey)) {
    return {
      contactPhone: normalizeConversationPhone(message.to),
      userPhone: normalizeConversationPhone(message.from),
    };
  }

  if (toKey && workspacePhoneKeys.has(toKey)) {
    return {
      contactPhone: normalizeConversationPhone(message.from),
      userPhone: normalizeConversationPhone(message.to),
    };
  }

  if (message.direction === "inbound") {
    return {
      contactPhone: normalizeConversationPhone(message.from),
      userPhone: normalizeConversationPhone(message.to),
    };
  }

  return {
    contactPhone: normalizeConversationPhone(message.to),
    userPhone: normalizeConversationPhone(message.from),
  };
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
  repliedContactKeys: Set<string> = new Set(),
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
    const leftHasReplied =
      left.has_replied === true ||
      repliedContactKeys.has(getConversationPhoneKey(left.contact_phone) ?? "");
    const rightHasReplied =
      right.has_replied === true ||
      repliedContactKeys.has(getConversationPhoneKey(right.contact_phone) ?? "");
    const repliedDelta = Number(rightHasReplied) - Number(leftHasReplied);

    if (repliedDelta !== 0) {
      return repliedDelta;
    }

    return compareByRecentActivity(left, right);
  });
}
