/**
 * Campaign completion re-check after provider message settlement (#2048).
 *
 * Why this module exists
 *
 * A `campaign_queue` row is dequeued the moment the send request is handed to
 * Twilio, not when the carrier settles the message. Measured on the Eric
 * Lombardi blast (2026-09-24): our database recorded the last request at
 * 6:29pm EDT and the campaign reported complete, while Twilio's own log showed
 * 5,382 messages still held inside the provider and released to carriers
 * between 11:59pm and 1:46am EDT — a median lag of 7.3 hours.
 *
 * `try_complete_campaign_if_drained` now refuses to complete while any campaign
 * message is unsettled. That gate is only correct if something asks again once
 * the messages DO settle. Nothing did before this module: the dispatch chain
 * stops when the local queue empties, and the SMS status callback path never
 * consulted completion at all. Without a re-check the gate would strand every
 * message campaign at `running` forever.
 *
 * Design rules
 *
 * - This module never calls Twilio, and never re-derives the settled/pending
 *   rule. Both live in the database: the gate asks
 *   `try_complete_campaign_if_drained`, and the sweep asks
 *   `campaign_ids_with_unsettled_messages`. A TypeScript re-implementation of
 *   the filter shipped here once and broke the recovery path in two ways that
 *   no test caught (NULL rows dropped by `NOT IN`, and a row-level limit that
 *   starved whole campaigns at blast scale). Both are documented at the SQL.
 * - Every re-check is best-effort. A failure here must never fail the status
 *   webhook or the open-sync sweep that triggered it; the next event retries.
 * - A NULL `campaignId` is not re-checked. The inbound SMS write path leaves
 *   `message.campaign_id` NULL (#2046), and there is no campaign to complete.
 */
import {
  rpcCampaignIdsWithUnsettledMessages,
  rpcTryCompleteCampaignIfDrained,
} from "@/lib/db-rpc.server";
import { logger } from "@/lib/logger.server";
import { createTenantDb } from "@/server/tenant-db";

/**
 * Ask the completion gate about one campaign, best-effort.
 *
 * Returns true when the campaign is now complete. Never throws: a Twilio status
 * webhook must still return 200 when this fails, or Twilio retries the
 * callback and the billing side effects run twice.
 *
 * `reason` is for the log line only. It says which event prompted the ask, so a
 * campaign that completes here can be traced back to the callback or sweep that
 * closed it.
 */
export async function recheckCampaignCompletion(input: {
  workspaceId: string;
  campaignId: number | null | undefined;
  reason: string;
}): Promise<boolean> {
  const { workspaceId, campaignId, reason } = input;
  if (campaignId == null) return false;

  try {
    const completed = await rpcTryCompleteCampaignIfDrained(
      createTenantDb(workspaceId),
      campaignId,
    );
    if (completed) {
      logger.info("campaign.completed_on_recheck", {
        campaignId,
        workspaceId,
        reason,
      });
    }
    return completed;
  } catch (error) {
    logger.warn("campaign.completion_recheck_failed", {
      campaignId,
      workspaceId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Re-check every campaign in the workspace that the gate is currently
 * refusing, and report how many completed.
 *
 * This is the lost-callback recovery path. When a Twilio status webhook is
 * lost, no re-check ever runs for that message and the campaign would sit at
 * `running` until an operator noticed. The open-sync sweep repairs the message
 * status; this turns that repair into a completion decision.
 *
 * Candidate selection and the cap live in SQL
 * (`campaign_ids_with_unsettled_messages`). The cap counts distinct campaigns
 * and the candidates are ordered oldest-stranded first, so a campaign holding
 * tens of thousands of unsettled rows cannot crowd others out, and anything
 * past the cap is picked up on a later run rather than being starved forever.
 */
export async function recheckCampaignsWithUnsettledMessages(input: {
  workspaceId: string;
  reason: string;
}): Promise<number> {
  const { workspaceId, reason } = input;

  let campaignIds: number[];
  try {
    campaignIds = await rpcCampaignIdsWithUnsettledMessages(
      createTenantDb(workspaceId),
      workspaceId,
    );
  } catch (error) {
    logger.warn("campaign.unsettled_message_sweep_failed", {
      workspaceId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }

  if (campaignIds.length === 0) return 0;

  let completed = 0;
  for (const campaignId of campaignIds) {
    const didComplete = await recheckCampaignCompletion({
      workspaceId,
      campaignId,
      reason,
    });
    if (didComplete) completed += 1;
  }

  logger.info("campaign.unsettled_message_sweep", {
    workspaceId,
    reason,
    campaignsChecked: campaignIds.length,
    campaignsCompleted: completed,
  });
  return completed;
}
