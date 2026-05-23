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
  /** Body of the most recent inbound message; used to filter STOP-only conversations. */
  last_inbound_body?: string | null;
};

type ConversationMessageLike = {
  from: string | null;
  to: string | null;
  direction: string | null;
};

export type ChatSortOption = "recent" | "hasReplied" | "hasUnreadReply";

/** Twilio / DB enum: inbound customer messages only (not outbound-reply). */
export function isInboundMessageDirection(direction: string | null | undefined): boolean {
  return direction === "inbound";
}

export function normalizeConversationPhone(
  phone: string | null,
): string | null {
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
  if (digits.length === 11 && digits.startsWith("1")) return digits;

  return digits;
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

  if (isInboundMessageDirection(message.direction)) {
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

function hasConversationReplied(
  conversation: ConversationSummary,
  repliedContactKeys: Set<string>,
): boolean {
  const contactKey = getConversationPhoneKey(conversation.contact_phone);
  return (
    conversation.has_replied === true ||
    (contactKey !== null && repliedContactKeys.has(contactKey))
  );
}

function matchesChatSortFilter(
  conversation: ConversationSummary,
  sortBy: ChatSortOption,
  repliedContactKeys: Set<string>,
): boolean {
  if (sortBy === "hasUnreadReply") {
    return conversation.unread_count > 0;
  }

  if (sortBy === "hasReplied") {
    return hasConversationReplied(conversation, repliedContactKeys);
  }

  return true;
}

export function sortConversationSummaries(
  conversations: ConversationSummary[],
  sortBy: ChatSortOption,
  repliedContactKeys: Set<string> = new Set(),
): ConversationSummary[] {
  return conversations
    .filter((conversation) =>
      matchesChatSortFilter(conversation, sortBy, repliedContactKeys),
    )
    .sort(compareByRecentActivity);
}
