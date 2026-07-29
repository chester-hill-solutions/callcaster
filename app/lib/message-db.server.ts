import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { message as messageTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { emitChatMessageEvent } from "@/lib/workspace-events.server";
import { logger } from "@/lib/logger.server";

type MessageRow = typeof messageTable.$inferSelect;

/**
 * Statuses a message must never regress out of: the outbound billable
 * terminals plus the inbound terminals. Terminal→terminal transitions
 * (delivered→read) stay allowed; terminal→non-terminal (a late `sent`
 * callback overwriting `delivered`) is dropped. Mirrors the call-side guard
 * in {@link updateCallBySid}. Safe to inline via `sql.raw`: fixed constant,
 * never user input.
 */
const TERMINAL_MESSAGE_STATUSES_SQL = sql.raw(
  `ARRAY[${["delivered", "failed", "undelivered", "received", "read"]
    .map((status) => `'${status}'`)
    .join(", ")}]`,
);

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

/**
 * Expand a phone number into the plausible raw formats it may have been
 * stored as (no CHECK constraint enforces E.164 on `message.from`/`to`).
 * Used with `inArray` instead of normalizing the column itself, so lookups
 * can still use any index on from/to rather than forcing a seq scan.
 *
 * Handles already-'+'-prefixed, 11-digit leading-1, and bare 10-digit input.
 * Junk/empty input is returned as its own sole variant rather than throwing.
 */
export function expandPhoneMatchVariants(phone: string): string[] {
  if (!phone) return [phone];

  const digits = phone.replace(/\D/g, "");
  if (!digits) return [phone];

  const e164 =
    digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : phone.startsWith("+")
          ? phone
          : `+${digits}`;

  const variants = new Set<string>([phone, e164]);

  const e164Digits = e164.replace(/\D/g, "");
  variants.add(e164Digits);
  if (e164Digits.length === 11 && e164Digits.startsWith("1")) {
    variants.add(e164Digits.slice(1));
  }

  return Array.from(variants);
}

export async function fetchMessagePageForContact(
  workspaceId: string,
  contactFilter: string,
  before?: string | null,
  options?: { tdb?: TenantDb; pageSize?: number },
): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const pageSize = options?.pageSize ?? DEFAULT_MESSAGE_PAGE_SIZE;
  const tdb = options?.tdb ?? createTenantDb(workspaceId);

  const rows = (await tdb.message.findMany({
    where: and(
      isNotNull(messageTable.date_created),
      or(eq(messageTable.from, contactFilter), eq(messageTable.to, contactFilter)),
      ...(before ? [lt(messageTable.date_created, before)] : []),
    ),
    orderBy: [desc(messageTable.date_created)],
    limit: pageSize + 1,
  })) as MessageRow[];

  const hasMore = rows.length > pageSize;
  return {
    messages: hasMore ? rows.slice(0, pageSize) : rows,
    hasMore,
  };
}

export async function markReceivedMessagesAsDeliveredForPhone(
  workspaceId: string,
  phone: string,
  options?: { tdb?: TenantDb },
): Promise<void> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const variants = expandPhoneMatchVariants(phone);
  const where = and(
    eq(messageTable.status, "received"),
    or(inArray(messageTable.from, variants), inArray(messageTable.to, variants)),
  );
  const existingRows = (await tdb.message.findMany({ where })) as MessageRow[];
  const updatedRows = (await tdb.message.update({
    set: { status: "delivered" },
    where,
  })) as MessageRow[];
  if (updatedRows.length === 0) return;

  const existingBySid = new Map(
    (existingRows ?? []).map((row) => [row.sid, row]),
  );
  for (const row of updatedRows) {
    const existing = existingBySid.get(row.sid) ?? null;
    await emitChatMessageEvent(
      workspaceId,
      "UPDATE",
      row as Record<string, unknown>,
      existing as Record<string, unknown> | null,
    );
  }
}

export async function markMessageAsDeliveredBySid(
  workspaceId: string,
  sid: string,
  options?: { tdb?: TenantDb },
): Promise<void> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const where = and(eq(messageTable.sid, sid), eq(messageTable.status, "received"));
  const existingRows = (await tdb.message.findMany({ where, limit: 1 })) as MessageRow[];
  const existing = existingRows?.[0] ?? null;
  const [row] = (await tdb.message.update({
    set: { status: "delivered" },
    where,
  })) as MessageRow[];
  if (row) {
    await emitChatMessageEvent(
      workspaceId,
      "UPDATE",
      row as Record<string, unknown>,
      existing as Record<string, unknown> | null,
    );
  }
}

/**
 * Count distinct "other side" phone numbers seen across a conversation's
 * messages (i.e. how many different workspace numbers have texted this
 * contact). Used to show a "used multiple of your numbers" banner. Reuses
 * the same from/to exact-match filter as fetchMessagePageForContact so it
 * only counts messages actually shown in the thread.
 */
export async function countDistinctNumbersForConversation(
  workspaceId: string,
  contactFilter: string,
  options?: { tdb?: TenantDb },
): Promise<number> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const rows = (await tdb.message.findMany({
    where: and(
      isNotNull(messageTable.date_created),
      or(eq(messageTable.from, contactFilter), eq(messageTable.to, contactFilter)),
    ),
    columns: { from: true, to: true },
  })) as Array<{ from: string | null; to: string | null }>;

  const otherNumbers = new Set<string>();
  for (const row of rows) {
    const other = row.from === contactFilter ? row.to : row.from;
    if (other) {
      otherNumbers.add(other);
    }
  }

  return otherNumbers.size;
}

export async function fetchLatestMessageForPhone(
  workspaceId: string,
  phone: string,
  options?: { tdb?: TenantDb },
): Promise<MessageRow | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const rows = (await tdb.message.findMany({
    where: and(
      isNotNull(messageTable.date_created),
      or(eq(messageTable.from, phone), eq(messageTable.to, phone)),
    ),
    orderBy: [desc(messageTable.date_created)],
    limit: 1,
  })) as MessageRow[];
  return rows[0] ?? null;
}

/** Global lookup by Twilio SID (webhooks do not carry workspace id). */
export async function findMessageBySid(sid: string): Promise<MessageRow | null> {
  const rows = await db
    .select()
    .from(messageTable)
    .where(eq(messageTable.sid, sid))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateMessageBySid(
  workspaceId: string,
  sid: string,
  update: Partial<MessageRow>,
  options?: { tdb?: TenantDb },
): Promise<MessageRow | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const existingRows = (await tdb.message.findMany({
    where: eq(messageTable.sid, sid),
    limit: 1,
  })) as MessageRow[];
  const existing = existingRows[0] ?? null;

  // Status-transition guard, enforced atomically inside the UPDATE (same
  // shape as updateCallBySid): keep the row's current status when it is
  // already terminal and the incoming status is not — out-of-order Twilio
  // callbacks must not regress delivered/failed back to sent/sending.
  const set =
    update.status == null
      ? update
      : ({
          ...update,
          status: sql`CASE WHEN LOWER(${messageTable.status}) = ANY(${TERMINAL_MESSAGE_STATUSES_SQL}) AND LOWER(${update.status}) <> ALL(${TERMINAL_MESSAGE_STATUSES_SQL}) THEN ${messageTable.status} ELSE ${update.status} END`,
        } as unknown as Partial<MessageRow>);

  const [row] = await tdb.message.update({
    set,
    where: eq(messageTable.sid, sid),
  });
  if (row && update.status != null && row.status !== update.status) {
    logger.debug("Skipped message status regression", {
      sid,
      current: row.status,
      next: update.status,
    });
  }
  if (row) {
    await emitChatMessageEvent(
      workspaceId,
      "UPDATE",
      row as Record<string, unknown>,
      (existing ?? null) as Record<string, unknown> | null,
    );
  }
  return row ?? null;
}

export async function countCampaignMessagesToPhone(
  workspaceId: string,
  campaignId: string | number,
  to: string,
  options?: { tdb?: TenantDb },
): Promise<number> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  return tdb.message.count({
    where: and(
      eq(messageTable.campaign_id, Number(campaignId)),
      eq(messageTable.to, to),
    ),
  });
}
