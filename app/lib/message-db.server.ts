import { and, desc, eq, isNotNull, lt, ne, or } from "drizzle-orm";
import { message as messageTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

type MessageRow = typeof messageTable.$inferSelect;

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

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
      ne(messageTable.status, "failed"),
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
  await tdb.message.update({
    set: { status: "delivered" },
    where: and(
      eq(messageTable.status, "received"),
      or(eq(messageTable.from, phone), eq(messageTable.to, phone)),
    ),
  });
}

export async function markMessageAsDeliveredBySid(
  workspaceId: string,
  sid: string,
  options?: { tdb?: TenantDb },
): Promise<void> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  await tdb.message.update({
    set: { status: "delivered" },
    where: and(eq(messageTable.sid, sid), eq(messageTable.status, "received")),
  });
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
      ne(messageTable.status, "failed"),
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
  const [row] = await tdb.message.update({
    set: update,
    where: eq(messageTable.sid, sid),
  });
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
