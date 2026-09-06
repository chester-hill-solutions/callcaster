/**
 * Campaign completion driven by queue dequeues (#1484).
 *
 * `try_complete_campaign_if_drained` already treats dequeued rows as done;
 * these helpers make sure it is asked after every dequeue, whichever surface
 * did it, instead of only when a worker dispatch tick happens to observe an
 * empty queue. Kept out of campaign-queue-db.server.ts to stay under the
 * file-size guard.
 */
import { and, eq } from "drizzle-orm";
import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { rpcTryCompleteCampaignIfDrained, type RpcExecutor } from "@/lib/db-rpc.server";
import { logger } from "@/lib/logger.server";

type DequeuedRow = { campaign_id: number | null; workspace?: string | null };

/**
 * A dequeue may have been the campaign's last pending row. Every dequeue path
 * ends here so a campaign completes no matter which surface drained it —
 * an agent's last call, an opt-out, a duplicate, a failed send — instead of
 * only when a worker dispatch tick happens to observe an empty queue (#1484).
 * Completion is best-effort: the dequeue itself has already committed.
 */
export async function completeCampaignsDrainedByDequeue(
  rows: DequeuedRow[],
  workspaceId: string | null | undefined,
): Promise<void> {
  if (rows.length === 0) return;
  const exec = workspaceId ? createTenantDb(workspaceId) : db;
  await tryCompleteDrainedCampaigns(
    rows.map((row) => row.campaign_id).filter((id): id is number => id != null),
    exec,
  );
}

export async function campaignIdsForContact(contactId: number, workspaceId: string): Promise<number[]> {
  const rows = await db
    .select({ campaign_id: campaignQueueTable.campaign_id })
    .from(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.contact_id, contactId),
        eq(campaignQueueTable.workspace, workspaceId),
      ),
    );
  return rows.map((row) => row.campaign_id).filter((id): id is number => id != null);
}

export async function tryCompleteDrainedCampaigns(
  campaignIds: Iterable<number>,
  exec: RpcExecutor,
): Promise<void> {
  for (const campaignId of new Set(campaignIds)) {
    try {
      const completed = await rpcTryCompleteCampaignIfDrained(exec, campaignId);
      if (completed) {
        logger.info("campaign.completed_on_last_dequeue", { campaignId });
      }
    } catch (error) {
      logger.warn("campaign.complete_on_dequeue_failed", {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
