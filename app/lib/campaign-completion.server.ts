import { rpcTryCompleteCampaignIfDrained, type RpcExecutor } from "@/lib/db-rpc.server";
import { logger } from "@/lib/logger.server";

/**
 * Completion is best-effort: a failed gate means "not complete yet". It must
 * not fail completed call work, a provider callback, or a dispatch job. Later
 * queue, settlement, or recovery events can ask the SQL gate again.
 *
 * Keep a caller's executor when supplied so a completion write shares its
 * transaction and rolls back with it (#2154).
 */
export async function recheckCampaignCompletion(input: {
  campaignId: number | null | undefined;
  workspaceId: string | null | undefined;
  reason: string;
  exec: RpcExecutor;
}): Promise<boolean> {
  const { campaignId, workspaceId = null, reason, exec } = input;
  if (campaignId == null) return false;

  const context = { campaignId, workspaceId, reason };
  try {
    const completed = await rpcTryCompleteCampaignIfDrained(exec, campaignId);
    if (completed) logger.info("campaign.completed", context);
    return completed;
  } catch (error) {
    logger.warn("campaign.completion_failed", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
