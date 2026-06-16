import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { logger } from "../logger.server";
import {
  getConversationParticipantPhones,
  getConversationPhoneKey,
  isInboundMessageDirection,
  sortConversationSummaries,
  type ChatSortOption,
  type ConversationSummary,
} from "../chat-conversation-sort";

type FetchConversationSummaryOptions = {
  limit?: number;
  offset?: number;
  sort?: ChatSortOption;
};

type ConversationMessageRow = Pick<
  Database["public"]["Tables"]["message"]["Row"],
  | "body"
  | "campaign_id"
  | "contact_id"
  | "date_created"
  | "direction"
  | "from"
  | "status"
  | "to"
>;

type ContactNameRow = Pick<
  Database["public"]["Tables"]["contact"]["Row"],
  "firstname" | "id" | "phone" | "surname"
>;

type PhoneMatchedContactRow =
  Database["public"]["Functions"]["find_contact_by_phone"]["Returns"][number];

function compareConversationDates(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function contactMatchesConversationPhone(
  contact: ContactNameRow | undefined,
  contactPhone: string,
): contact is ContactNameRow {
  if (!contact?.phone) {
    return false;
  }

  return (
    getConversationPhoneKey(contact.phone) ===
    getConversationPhoneKey(contactPhone)
  );
}

function conversationNeedsPhoneMatchedContact(
  conversation: ConversationSummary,
): boolean {
  return !conversation.contact_firstname && !conversation.contact_surname;
}

/** Max messages to fetch when building conversation list; keeps contact/phone lookups bounded. */
const CONVERSATION_MESSAGE_CAP = 30_000;
const CONVERSATION_MESSAGE_PAGE_SIZE = 2_000;

const CONTACT_IDS_BATCH_SIZE = 800;
const PHONES_BATCH_SIZE = 800;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function fetchConversationSummary(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  campaign_id?: string | null,
  options: FetchConversationSummaryOptions = {},
) {
  const limit = Math.max(1, options.limit ?? 20);
  const offset = Math.max(0, options.offset ?? 0);
  const sort = options.sort ?? "recent";

  const { data: workspaceNumberRows, error: workspaceNumbersError } =
    await supabaseClient
      .from("workspace_number")
      .select("phone_number")
      .eq("workspace", workspaceId);

  if (workspaceNumbersError) {
    return { chats: [], chatsError: workspaceNumbersError, hasMore: false };
  }

  const workspacePhoneKeys = new Set(
    (workspaceNumberRows ?? [])
      .map((row) => getConversationPhoneKey(row.phone_number))
      .filter((phone): phone is string => Boolean(phone)),
  );

  const conversationMap = new Map<string, ConversationSummary>();
  const conversationContactIds = new Map<string, number>();
  const contactIds = new Set<number>();

  const numericCampaignId = campaign_id ? Number(campaign_id) : null;
  const shouldFilterByCampaign =
    numericCampaignId !== null && !Number.isNaN(numericCampaignId);

  let scannedMessages = 0;
  let cursor = 0;
  let hasMoreRows = true;

  while (hasMoreRows && scannedMessages < CONVERSATION_MESSAGE_CAP) {
    const pageStart = cursor;
    const pageLimit = Math.min(
      CONVERSATION_MESSAGE_PAGE_SIZE,
      CONVERSATION_MESSAGE_CAP - scannedMessages,
    );
    const pageEnd = pageStart + pageLimit - 1;

    let pageQuery = supabaseClient
      .from("message")
      .select(
        "body, campaign_id, contact_id, date_created, direction, from, status, to",
      )
      .eq("workspace", workspaceId)
      .not("date_created", "is", null)
      .neq("status", "failed")
      .order("date_created", { ascending: false })
      .range(pageStart, pageEnd);

    if (shouldFilterByCampaign) {
      pageQuery = pageQuery.eq("campaign_id", numericCampaignId as number);
    }

    const { data: pageRows, error: messagesError } = await pageQuery;
    if (messagesError) {
      return { chats: [], chatsError: messagesError, hasMore: false };
    }

    const typedRows = (pageRows ?? []) as ConversationMessageRow[];
    if (typedRows.length === 0) {
      hasMoreRows = false;
      continue;
    }

    scannedMessages += typedRows.length;
    cursor += typedRows.length;
    hasMoreRows = typedRows.length === pageLimit;

    for (const message of typedRows) {
      if (typeof message.contact_id === "number") {
        contactIds.add(message.contact_id);
      }

      const { contactPhone, userPhone } = getConversationParticipantPhones(
        message,
        workspacePhoneKeys,
      );
      const conversationKey = getConversationPhoneKey(contactPhone);
      const timestamp = message.date_created ?? new Date().toISOString();

      if (!contactPhone || !conversationKey) {
        continue;
      }

      if (
        typeof message.contact_id === "number" &&
        !conversationContactIds.has(conversationKey)
      ) {
        // Rows are scanned newest-first, so the first contact_id per conversation
        // is the strongest candidate and keeps contact lookups bounded.
        conversationContactIds.set(conversationKey, message.contact_id);
      }

      const existingConversation = conversationMap.get(conversationKey);
      const hasReplied = isInboundMessageDirection(message.direction);
      const unreadIncrement =
        isInboundMessageDirection(message.direction) && message.status === "received"
          ? 1
          : 0;

      if (!existingConversation) {
        conversationMap.set(conversationKey, {
          contact_phone: contactPhone,
          user_phone: userPhone ?? "",
          conversation_start: timestamp,
          conversation_last_update: timestamp,
          message_count: 1,
          unread_count: unreadIncrement,
          contact_firstname: null,
          contact_surname: null,
          has_replied: hasReplied,
          last_inbound_body:
            hasReplied && message.body != null ? message.body : null,
        });
        continue;
      }

      existingConversation.message_count += 1;
      existingConversation.unread_count += unreadIncrement;
      existingConversation.has_replied =
        existingConversation.has_replied === true || hasReplied;
      if (
        existingConversation.last_inbound_body == null &&
        hasReplied &&
        message.body != null
      ) {
        existingConversation.last_inbound_body = message.body;
      }

      if (
        compareConversationDates(
          existingConversation.conversation_start,
          timestamp,
        ) > 0
      ) {
        existingConversation.conversation_start = timestamp;
      }

      if (
        compareConversationDates(
          existingConversation.conversation_last_update,
          timestamp,
        ) < 0
      ) {
        existingConversation.conversation_last_update = timestamp;
      }

      if (!existingConversation.user_phone && userPhone) {
        existingConversation.user_phone = userPhone;
      }

      if (!existingConversation.contact_phone && contactPhone) {
        existingConversation.contact_phone = contactPhone;
      }
    }
  }

  const contactsById = new Map<number, ContactNameRow>();
  if (contactIds.size > 0) {
    const batches = chunk(Array.from(contactIds), CONTACT_IDS_BATCH_SIZE);
    const batchResults = await Promise.all(
      batches.map((ids) =>
        supabaseClient
          .from("contact")
          .select("firstname, id, phone, surname")
          .eq("workspace", workspaceId)
          .in("id", ids),
      ),
    );
    for (const { data: contactRows, error: contactsError } of batchResults) {
      if (contactsError) {
        logger.error("Error loading contact names for conversations", {
          message: contactsError.message,
          code: (contactsError as { code?: string }).code,
          details: (contactsError as { details?: string }).details,
          contactIdsCount: contactIds.size,
        });
      } else if (contactRows?.length) {
        for (const contact of contactRows) {
          contactsById.set(contact.id, contact);
        }
      }
    }
  }

  for (const [conversationKey, conversation] of conversationMap.entries()) {
    const candidateContactId = conversationContactIds.get(conversationKey);
    if (typeof candidateContactId !== "number") {
      continue;
    }

    const candidateContact = contactsById.get(candidateContactId);
    if (
      !contactMatchesConversationPhone(
        candidateContact,
        conversation.contact_phone,
      )
    ) {
      continue;
    }

    if (!conversation.contact_firstname && candidateContact.firstname) {
      conversation.contact_firstname = candidateContact.firstname;
    }

    if (!conversation.contact_surname && candidateContact.surname) {
      conversation.contact_surname = candidateContact.surname;
    }
  }

  if (typeof supabaseClient.rpc === "function") {
    const phonesMissingNames = Array.from(
      new Set(
        Array.from(conversationMap.values())
          .filter((conversation) =>
            conversationNeedsPhoneMatchedContact(conversation),
          )
          .map((conversation) => conversation.contact_phone)
          .filter((phone): phone is string => Boolean(phone)),
      ),
    );

    if (phonesMissingNames.length > 0) {
      const phoneMatchedContacts = new Map<string, PhoneMatchedContactRow>();
      const phoneBatches = chunk(phonesMissingNames, PHONES_BATCH_SIZE);
      const rpcResults = await Promise.all(
        phoneBatches.map((phones) =>
          supabaseClient.rpc("find_contacts_by_phones", {
            p_workspace_id: workspaceId,
            p_phone_numbers: phones,
          }),
        ),
      );
      for (const { data, error } of rpcResults) {
        if (error) {
          logger.error("Error loading contacts by phones for conversations", {
            error,
            workspaceId,
            phoneCount: phonesMissingNames.length,
          });
        } else if (data?.length) {
          for (const row of data) {
            const key = getConversationPhoneKey(row.phone) ?? row.phone;
            if (key) phoneMatchedContacts.set(key, row);
          }
        }
      }

      for (const conversation of conversationMap.values()) {
        if (!conversationNeedsPhoneMatchedContact(conversation)) {
          continue;
        }

        const lookupKey =
          getConversationPhoneKey(conversation.contact_phone) ??
          conversation.contact_phone;
        const matchedContact = lookupKey
          ? phoneMatchedContacts.get(lookupKey)
          : undefined;
        if (!matchedContact) {
          continue;
        }

        conversation.contact_firstname = matchedContact.firstname;
        conversation.contact_surname = matchedContact.surname;
      }
    }
  }

  const filteredAndSortedChats = sortConversationSummaries(
    Array.from(conversationMap.values()),
    sort,
  );
  const paginatedChats = filteredAndSortedChats.slice(offset, offset + limit + 1);
  const hasMore = paginatedChats.length > limit;

  return {
    chats: hasMore ? paginatedChats.slice(0, limit) : paginatedChats,
    chatsError: null,
    hasMore,
  };
}
