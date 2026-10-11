import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import {
  getConversationParticipantPhones,
  getConversationPhoneKey,
  isInboundMessageDirection,
  normalizeConversationPhone,
  toConversationTimestamp,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import type { Tables } from "@/lib/db-types";
import type { RouteWorkspaceNumber } from "@/lib/chats/types";

export const ALL_CAMPAIGNS_VALUE = "all";
export const phoneRegex =
  /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

function getComparableConversationPhone(phone: string | null): string | null {
  if (!phone) return null;
  // phoneNumbersMatch treats two non-empty values with no digits as matches.
  return getConversationPhoneKey(phone) ?? "";
}

export function mergeConversationPages(
  currentChats: ConversationSummary[],
  nextChats: ConversationSummary[],
): ConversationSummary[] {
  const mergedChats = [...currentChats];
  const indexByPhone = new Map<string, number>();

  currentChats.forEach((chat, index) => {
    const phoneKey = getComparableConversationPhone(chat.contact_phone);
    // Keep the first match, as phoneNumbersMatch/findIndex did before.
    if (phoneKey !== null && !indexByPhone.has(phoneKey)) {
      indexByPhone.set(phoneKey, index);
    }
  });

  for (const nextChat of nextChats) {
    const phoneKey = getComparableConversationPhone(nextChat.contact_phone);
    const existingIndex = phoneKey === null ? undefined : indexByPhone.get(phoneKey);

    if (existingIndex !== undefined) {
      mergedChats[existingIndex] = {
        ...mergedChats[existingIndex],
        ...nextChat,
      };
      continue;
    }

    if (phoneKey !== null) indexByPhone.set(phoneKey, mergedChats.length);
    mergedChats.push(nextChat);
  }

  return mergedChats;
}

export function getWorkspacePhoneKeys(
  workspaceNumbers: RouteWorkspaceNumber[],
): Set<string> {
  return new Set(
    workspaceNumbers
      .map((workspaceNumber) => workspaceNumber.phone_number)
      .map((phoneNumber) =>
        phoneNumber ? normalizeConversationPhone(phoneNumber) : null,
      )
      .filter((phoneNumber): phoneNumber is string => Boolean(phoneNumber))
      .map((phoneNumber) => phoneNumber.replace(/\D/g, "")),
  );
}

export function upsertConversationFromMessage({
  currentChats,
  message,
  activeContactNumber,
  workspacePhoneKeys,
}: {
  currentChats: ConversationSummary[];
  message: Tables<"message">;
  activeContactNumber?: string;
  workspacePhoneKeys: Set<string>;
}): ConversationSummary[] {
  const { contactPhone, userPhone } = getConversationParticipantPhones(
    {
      from: message.from,
      to: message.to,
      direction: message.direction,
    },
    workspacePhoneKeys,
  );

  if (!contactPhone) {
    return currentChats;
  }

  const nextTimestamp =
    toConversationTimestamp(message.date_created) ?? new Date().toISOString();
  const isInbound = isInboundMessageDirection(message.direction);
  const isActiveConversation =
    Boolean(activeContactNumber) &&
    phoneNumbersMatch(contactPhone, activeContactNumber ?? null);
  const unreadIncrement =
    isInbound && message.status === "received" && !isActiveConversation ? 1 : 0;
  const contactKey = getComparableConversationPhone(contactPhone);
  const existingConversationIndex = currentChats.findIndex(
    (chat) =>
      contactKey !== null &&
      getComparableConversationPhone(chat.contact_phone) === contactKey,
  );

  if (existingConversationIndex < 0) {
    return [
      ...currentChats,
      {
        contact_phone: contactPhone,
        user_phone: userPhone ?? "",
        conversation_start: nextTimestamp,
        conversation_last_update: nextTimestamp,
        message_count: 1,
        unread_count: unreadIncrement,
        contact_firstname: null,
        contact_surname: null,
        has_replied: isInbound,
      },
    ];
  }

  const updatedChats = [...currentChats];
  const existingConversation = currentChats[existingConversationIndex];
  if (!existingConversation) return currentChats;

  updatedChats[existingConversationIndex] = {
    ...existingConversation,
    user_phone: existingConversation.user_phone || userPhone || "",
    message_count: existingConversation.message_count + 1,
    unread_count: existingConversation.unread_count + unreadIncrement,
    conversation_last_update:
      new Date(existingConversation.conversation_last_update).getTime() >
      new Date(nextTimestamp).getTime()
        ? existingConversation.conversation_last_update
        : nextTimestamp,
    has_replied: existingConversation.has_replied === true || isInbound,
  };
  return updatedChats;
}
