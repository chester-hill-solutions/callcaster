import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import {
  getConversationParticipantPhones,
  isInboundMessageDirection,
  normalizeConversationPhone,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import type { Tables } from "@/lib/database.types";
import type { RouteWorkspaceNumber } from "./types";

export const ALL_CAMPAIGNS_VALUE = "all";
export const phoneRegex =
  /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

export function mergeConversationPages(
  currentChats: ConversationSummary[],
  nextChats: ConversationSummary[],
): ConversationSummary[] {
  const mergedChats = [...currentChats];

  for (const nextChat of nextChats) {
    const existingIndex = mergedChats.findIndex((chat) =>
      phoneNumbersMatch(chat.contact_phone, nextChat.contact_phone),
    );

    if (existingIndex >= 0) {
      mergedChats[existingIndex] = {
        ...mergedChats[existingIndex],
        ...nextChat,
      };
      continue;
    }

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

  const nextTimestamp = message.date_created ?? new Date().toISOString();
  const isInbound = isInboundMessageDirection(message.direction);
  const isActiveConversation =
    Boolean(activeContactNumber) &&
    phoneNumbersMatch(contactPhone, activeContactNumber ?? null);
  const unreadIncrement =
    isInbound && message.status === "received" && !isActiveConversation ? 1 : 0;
  const existingConversationIndex = currentChats.findIndex((chat) =>
    phoneNumbersMatch(chat.contact_phone, contactPhone),
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

  return currentChats.map((chat, index) => {
    if (index !== existingConversationIndex) {
      return chat;
    }

    return {
      ...chat,
      user_phone: chat.user_phone || userPhone || "",
      message_count: chat.message_count + 1,
      unread_count: chat.unread_count + unreadIncrement,
      conversation_last_update:
        new Date(chat.conversation_last_update).getTime() >
        new Date(nextTimestamp).getTime()
          ? chat.conversation_last_update
          : nextTimestamp,
      has_replied: chat.has_replied === true || isInbound,
    };
  });
}
