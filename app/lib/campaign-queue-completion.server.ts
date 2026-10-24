/**
 * Campaign completion driven by queue dequeues (#1484).
 *
 * `try_complete_campaign_if_drained` already treats dequeued rows as done;
 * these helpers make sure it is asked after every dequeue, whichever surface
 * did it, instead of only when a worker dispatch tick happens to observe an
 * empty queue. Kept out of campaign-queue-db.server.ts to stay under the
 * file-size guard.
 */
import type { RpcExecutor } from "@/lib/db-rpc.server";
import { recheckCampaignCompletion } from "@/lib/campaign-completion.server";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

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
  /**
   * Run the completion checks inside a caller's transaction rather than on the
   * module-level client. Without this, a caller that has wrapped its writes in
   * a transaction would still see a campaign marked complete by a write that
   * later rolls back (#2154).
   */
  execOverride?: RpcExecutor,
): Promise<void> {
  if (rows.length === 0) return;
  const exec = execOverride ?? (workspaceId ? createTenantDb(workspaceId) : db);
  await tryCompleteDrainedCampaigns(
    rows.map((row) => row.campaign_id).filter((id): id is number => id != null),
    exec,
    workspaceId,
  );
}

export async function tryCompleteDrainedCampaigns(
  campaignIds: Iterable<number>,
  exec: RpcExecutor,
  workspaceId?: string | null,
): Promise<void> {
  for (const campaignId of new Set(campaignIds)) {
    await recheckCampaignCompletion({ campaignId, workspaceId, exec, reason: "queue_dequeue" });
  }
}
