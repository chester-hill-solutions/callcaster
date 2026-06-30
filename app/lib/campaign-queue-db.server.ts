import { and, eq } from "drizzle-orm";
import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { buildDequeuedQueueUpdate } from "@/lib/queue-status";
import { db } from "@/server/db";

/** Dequeue campaign_queue rows for a contact (optionally scoped to one campaign). */
export async function dequeueCampaignQueueByContact(args: {
  contactId: number;
  campaignId?: number | null;
  userId: string;
  reason: string;
}) {
  const update = buildDequeuedQueueUpdate(args.userId, args.reason, {
    includeNormalizedFields: true,
  });
  const conditions = [eq(campaignQueueTable.contact_id, args.contactId)];
  if (args.campaignId != null) {
    conditions.push(eq(campaignQueueTable.campaign_id, args.campaignId));
  }

  return db
    .update(campaignQueueTable)
    .set(update)
    .where(and(...conditions))
    .returning();
}
