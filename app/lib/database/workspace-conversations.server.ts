import { inArray, sql, type SQL } from "drizzle-orm";
import { rpcFindContactsByPhones } from "@/lib/db-rpc.server";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "../logger.server";
import {
  getConversationPhoneKey,
  type ChatSortOption,
  type ConversationSummary,
} from "../chat-conversation-sort";
import {
  sumUnreadConversationCount,
  UNREAD_CONVERSATION_PAGE_SIZE,
} from "@/lib/chats/unread-count";
import { stripPhoneNumber } from "@/lib/phone";

type FetchConversationSummaryOptions = {
  enrichContacts?: boolean;
  limit?: number;
  offset?: number;
  sort?: ChatSortOption;
  /** Free-text filter matched against contact name, phone digits, and the
   * most recent inbound message body. Empty/whitespace = no filtering. */
  search?: string;
};

type ContactNameRow = {
  firstname: string | null;
  id: number;
  phone: string | null;
  surname: string | null;
};

/**
 * One row per conversation, produced by {@link buildConversationSummaryQuery}.
 * `conv_key` and `primary_contact_id` are internal — used only to drive the
 * contact-name enrichment pass below — and never returned to callers.
 */
type AggregatedConversationRow = {
  conv_key: string;
  contact_phone: string;
  user_phone: string | null;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
  has_replied: boolean;
  last_inbound_body: string | null;
  primary_contact_id: number | null;
};

const CONTACT_IDS_BATCH_SIZE = 800;
const PHONES_BATCH_SIZE = 800;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Escapes LIKE/ILIKE metacharacters so free-text search can't be used to
 * inject wildcard patterns. Postgres' default LIKE escape char is `\`. */
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function buildWorkspaceKeysArray(workspacePhoneKeys: Set<string>): SQL {
  const keys = Array.from(workspacePhoneKeys);
  if (keys.length === 0) {
    return sql`ARRAY[]::text[]`;
  }
  return sql`ARRAY[${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]`;
}

function buildSortPredicate(sort: ChatSortOption): SQL {
  if (sort === "hasReplied") return sql`has_replied = true`;
  if (sort === "hasUnreadReply") return sql`unread_count > 0`;
  return sql`true`;
}

/**
 * Matches the same conversations the JS reference implementation used to
 * search: contact phone digits, most-recent-inbound body text, and the
 * enriched contact's name (matched the same way the post-aggregation
 * enrichment pass matches it — by candidate contact id, falling back to a
 * normalised-phone-key match via the same function backing
 * idx_contact_workspace_normalised_phone).
 */
function buildSearchPredicate(workspaceId: string, search: string | undefined): SQL {
  const trimmed = (search ?? "").trim();
  if (!trimmed) return sql`true`;

  const likePattern = `%${escapeLikePattern(trimmed)}%`;
  const digits = stripPhoneNumber(trimmed);
  const phoneCondition =
    digits.length > 0
      ? sql`regexp_replace(a.contact_phone, '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
      : sql`false`;

  return sql`(
    ${phoneCondition}
    OR a.last_inbound_body ILIKE ${likePattern}
    OR EXISTS (
      SELECT 1 FROM public.contact c
      WHERE c.workspace = ${workspaceId}::uuid
        AND (
          c.id = a.primary_contact_id
          OR public.normalise_phone_key(c.phone) = a.conv_key
        )
        AND (
          c.firstname ILIKE ${likePattern}
          OR c.surname ILIKE ${likePattern}
          OR (COALESCE(c.firstname, '') || ' ' || COALESCE(c.surname, '')) ILIKE ${likePattern}
        )
    )
  )`;
}

/**
 * Builds the conversation-summary aggregation. Conversation identity mirrors
 * `getConversationParticipantPhones`/`getConversationPhoneKey`
 * (app/lib/chat-conversation-sort.ts): the "contact" side of a message is
 * whichever of from/to is NOT a workspace-owned number (falling back to
 * direction when neither side matches a workspace number), and the grouping
 * key is that contact phone's digit-normalised key
 * (`public.normalise_phone_key`, the same function backing
 * idx_contact_workspace_normalised_phone — verified equivalent to
 * getConversationPhoneKey).
 *
 * Per-conversation scalar fields (contact_phone/user_phone/last_inbound_body)
 * use `array_agg(... ORDER BY date_created DESC) FILTER (...)` to take the
 * most-recent non-null value, matching the JS reference's "scan newest-first,
 * first non-null value wins" behavior.
 */
function buildConversationSummaryQuery(params: {
  workspaceId: string;
  workspacePhoneKeys: Set<string>;
  campaignId: number | null;
  sort: ChatSortOption;
  search: string | undefined;
  limit: number;
  offset: number;
}): SQL {
  const { workspaceId, workspacePhoneKeys, campaignId, sort, search, limit, offset } = params;

  const campaignFilter =
    campaignId !== null ? sql`AND m.campaign_id = ${campaignId}` : sql``;
  const wsKeys = buildWorkspaceKeysArray(workspacePhoneKeys);
  const sortPredicate = buildSortPredicate(sort);
  const searchPredicate = buildSearchPredicate(workspaceId, search);

  return sql`
    WITH scoped AS (
      SELECT
        m.body,
        m.contact_id::int AS contact_id,
        m.date_created,
        m.direction,
        m.status,
        m."from" AS msg_from,
        m."to" AS msg_to,
        public.normalise_phone_key(m."from") AS from_key,
        public.normalise_phone_key(m."to") AS to_key,
        regexp_replace(m."from", '[^0-9]', '', 'g') AS from_digits,
        regexp_replace(m."to", '[^0-9]', '', 'g') AS to_digits
      FROM public.message m
      WHERE m.workspace = ${workspaceId}::uuid
        AND m.date_created IS NOT NULL
        AND m.status <> 'failed'
        ${campaignFilter}
    ),
    normed AS (
      SELECT
        body, contact_id, date_created, direction, status, from_key, to_key,
        CASE
          WHEN msg_from IS NULL OR from_digits = '' THEN NULL
          WHEN length(from_digits) = 10 THEN '+1' || from_digits
          WHEN length(from_digits) = 11 AND left(from_digits, 1) = '1' THEN '+' || from_digits
          WHEN left(msg_from, 1) = '+' THEN msg_from
          ELSE '+' || from_digits
        END AS from_norm,
        CASE
          WHEN msg_to IS NULL OR to_digits = '' THEN NULL
          WHEN length(to_digits) = 10 THEN '+1' || to_digits
          WHEN length(to_digits) = 11 AND left(to_digits, 1) = '1' THEN '+' || to_digits
          WHEN left(msg_to, 1) = '+' THEN msg_to
          ELSE '+' || to_digits
        END AS to_norm
      FROM scoped
    ),
    participants AS (
      SELECT
        date_created,
        direction,
        status,
        body,
        contact_id,
        CASE
          WHEN from_key IS NOT NULL AND from_key = ANY(${wsKeys}) THEN to_key
          WHEN to_key IS NOT NULL AND to_key = ANY(${wsKeys}) THEN from_key
          WHEN direction = 'inbound' THEN from_key
          ELSE to_key
        END AS conv_key,
        CASE
          WHEN from_key IS NOT NULL AND from_key = ANY(${wsKeys}) THEN to_norm
          WHEN to_key IS NOT NULL AND to_key = ANY(${wsKeys}) THEN from_norm
          WHEN direction = 'inbound' THEN from_norm
          ELSE to_norm
        END AS contact_phone,
        CASE
          WHEN from_key IS NOT NULL AND from_key = ANY(${wsKeys}) THEN from_norm
          WHEN to_key IS NOT NULL AND to_key = ANY(${wsKeys}) THEN to_norm
          WHEN direction = 'inbound' THEN to_norm
          ELSE from_norm
        END AS user_phone
      FROM normed
    ),
    agg AS (
      SELECT
        conv_key,
        (array_agg(contact_phone ORDER BY date_created DESC))[1] AS contact_phone,
        COALESCE(
          (array_agg(user_phone ORDER BY date_created DESC) FILTER (WHERE user_phone IS NOT NULL))[1],
          ''
        ) AS user_phone,
        MIN(date_created) AS conversation_start,
        MAX(date_created) AS conversation_last_update,
        COUNT(*)::int AS message_count,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND status = 'received')::int AS unread_count,
        COALESCE(BOOL_OR(direction = 'inbound'), false) AS has_replied,
        (array_agg(body ORDER BY date_created DESC) FILTER (WHERE direction = 'inbound' AND body IS NOT NULL))[1] AS last_inbound_body,
        (array_agg(contact_id ORDER BY date_created DESC) FILTER (WHERE contact_id IS NOT NULL))[1] AS primary_contact_id
      FROM participants
      WHERE conv_key IS NOT NULL
      GROUP BY conv_key
    ),
    searched AS (
      SELECT a.*
      FROM agg a
      WHERE (${sortPredicate}) AND (${searchPredicate})
    )
    SELECT
      conv_key,
      contact_phone,
      user_phone,
      conversation_start,
      conversation_last_update,
      message_count,
      unread_count,
      has_replied,
      last_inbound_body,
      primary_contact_id
    FROM searched
    ORDER BY conversation_last_update DESC, conv_key ASC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;
}

function contactMatchesConversationPhone(
  contact: ContactNameRow | undefined,
  contactPhone: string,
): contact is ContactNameRow {
  if (!contact?.phone) {
    return false;
  }

  return (
    getConversationPhoneKey(contact.phone) === getConversationPhoneKey(contactPhone)
  );
}

function conversationNeedsPhoneMatchedContact(
  conversation: ConversationSummary,
): boolean {
  return !conversation.contact_firstname && !conversation.contact_surname;
}

export async function fetchConversationSummary(
  workspaceId: string,
  campaign_id?: string | null,
  options: FetchConversationSummaryOptions = {},
) {
  const limit = Math.max(1, options.limit ?? 20);
  const offset = Math.max(0, options.offset ?? 0);
  const sort = options.sort ?? "recent";
  const search = options.search;
  const tdb = createTenantDb(workspaceId);

  let workspaceNumberRows: Array<{ phone_number: string | null }>;
  try {
    workspaceNumberRows = await tdb.workspace_number.findMany({
      columns: { phone_number: true },
    });
  } catch (workspaceNumbersError) {
    return {
      chats: [],
      chatsError: workspaceNumbersError as { message: string },
      hasMore: false,
    };
  }

  const workspacePhoneKeys = new Set(
    (workspaceNumberRows ?? [])
      .map((row) => getConversationPhoneKey(row.phone_number))
      .filter((phone): phone is string => Boolean(phone)),
  );

  const numericCampaignId = campaign_id ? Number(campaign_id) : null;
  const shouldFilterByCampaign =
    numericCampaignId !== null && !Number.isNaN(numericCampaignId);

  const query = buildConversationSummaryQuery({
    workspaceId,
    workspacePhoneKeys,
    campaignId: shouldFilterByCampaign ? (numericCampaignId as number) : null,
    sort,
    search,
    limit,
    offset,
  });

  let aggregatedRows: AggregatedConversationRow[];
  try {
    aggregatedRows = (await tdb.execute(query)) as AggregatedConversationRow[];
  } catch (aggregationError) {
    return {
      chats: [],
      chatsError: aggregationError as { message: string },
      hasMore: false,
    };
  }

  const hasMore = aggregatedRows.length > limit;
  const pageRows = hasMore ? aggregatedRows.slice(0, limit) : aggregatedRows;

  const conversationContactIds = new Map<string, number>();
  const contactIds = new Set<number>();

  const chats: ConversationSummary[] = pageRows.map((row) => {
    const conversationKey = getConversationPhoneKey(row.contact_phone);
    if (conversationKey && typeof row.primary_contact_id === "number") {
      conversationContactIds.set(conversationKey, row.primary_contact_id);
      contactIds.add(row.primary_contact_id);
    }

    return {
      contact_phone: row.contact_phone,
      user_phone: row.user_phone ?? "",
      conversation_start: row.conversation_start,
      conversation_last_update: row.conversation_last_update,
      message_count: row.message_count,
      unread_count: row.unread_count,
      contact_firstname: null,
      contact_surname: null,
      has_replied: row.has_replied,
      last_inbound_body: row.last_inbound_body ?? null,
    };
  });

  if (options.enrichContacts === false) {
    return {
      chats,
      chatsError: null,
      hasMore,
    };
  }

  const contactsById = new Map<number, ContactNameRow>();
  if (contactIds.size > 0) {
    const batches = chunk(Array.from(contactIds), CONTACT_IDS_BATCH_SIZE);
    try {
      const batchResults = await Promise.all(
        batches.map((ids) =>
          tdb.contact.findMany({
            where: inArray(contactTable.id, ids),
            columns: { firstname: true, id: true, phone: true, surname: true },
          }),
        ),
      );
      for (const contactRows of batchResults) {
        if (contactRows.length) {
          for (const contact of contactRows) {
            contactsById.set(contact.id, contact as ContactNameRow);
          }
        }
      }
    } catch (contactsError) {
      logger.error("Error loading contact names for conversations", {
        message: contactsError instanceof Error ? contactsError.message : String(contactsError),
        contactIdsCount: contactIds.size,
      });
    }
  }

  for (const conversation of chats) {
    const conversationKey = getConversationPhoneKey(conversation.contact_phone);
    const candidateContactId = conversationKey
      ? conversationContactIds.get(conversationKey)
      : undefined;
    if (typeof candidateContactId !== "number") {
      continue;
    }

    const candidateContact = contactsById.get(candidateContactId);
    if (!contactMatchesConversationPhone(candidateContact, conversation.contact_phone)) {
      continue;
    }

    if (!conversation.contact_firstname && candidateContact.firstname) {
      conversation.contact_firstname = candidateContact.firstname;
    }

    if (!conversation.contact_surname && candidateContact.surname) {
      conversation.contact_surname = candidateContact.surname;
    }
  }

  const phonesMissingNames = Array.from(
    new Set(
      chats
        .filter((conversation) => conversationNeedsPhoneMatchedContact(conversation))
        .map((conversation) => conversation.contact_phone)
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );

  if (phonesMissingNames.length > 0) {
    const phoneMatchedContacts = new Map<string, ContactNameRow>();
    const phoneBatches = chunk(phonesMissingNames, PHONES_BATCH_SIZE);
    const rpcResults = await Promise.all(
      phoneBatches.map((phones) =>
        rpcFindContactsByPhones(workspaceId, phones).then(
          (data) => ({ data, error: null as null }),
          (error) => ({ data: null as null, error }),
        ),
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
        for (const row of data as ContactNameRow[]) {
          const key = getConversationPhoneKey(row.phone) ?? row.phone;
          if (key) phoneMatchedContacts.set(key, row);
        }
      }
    }

    for (const conversation of chats) {
      if (!conversationNeedsPhoneMatchedContact(conversation)) {
        continue;
      }

      const lookupKey =
        getConversationPhoneKey(conversation.contact_phone) ?? conversation.contact_phone;
      const matchedContact = lookupKey ? phoneMatchedContacts.get(lookupKey) : undefined;
      if (!matchedContact) {
        continue;
      }

      conversation.contact_firstname = matchedContact.firstname;
      conversation.contact_surname = matchedContact.surname;
    }
  }

  return {
    chats,
    chatsError: null,
    hasMore,
  };
}

/**
 * Uses the same newest-100-conversation window as the persistent navigation
 * badge so the server-rendered Today action and client badge agree.
 */
export async function getWorkspaceUnreadConversationCount(
  workspaceId: string,
): Promise<number> {
  const result = await fetchConversationSummary(workspaceId, null, {
    enrichContacts: false,
    limit: UNREAD_CONVERSATION_PAGE_SIZE,
  });
  if (result.chatsError) {
    logger.error("Error loading unread conversation count", {
      error: result.chatsError,
      workspaceId,
    });
    return 0;
  }
  return sumUnreadConversationCount(result.chats);
}

// Exposed for the SQL/JS parity fixture test (test/workspace-conversations-sql-parity.test.ts).
export const __internal = {
  buildConversationSummaryQuery,
};
