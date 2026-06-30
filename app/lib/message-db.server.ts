import { and, eq } from "drizzle-orm";
import { message as messageTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

type MessageRow = typeof messageTable.$inferSelect;

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
