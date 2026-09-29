/**
 * Writing a campaign_queue row addressed by a lookup key.
 *
 * Split out of `campaign-queue-db.server.ts`, which sat five lines under the
 * file-size cap and so could not take a change without failing the guard. The
 * boundary is what the caller supplies: everything here is addressed by a key
 * the caller already holds (a queue id, or a contact+campaign pair), while
 * everything left in the parent either reads, deletes, or decides a row's
 * lifecycle — claiming, dequeuing, completing a drained campaign.
 *
 * `dequeueCampaignQueueById` stays in the parent, not out of inertia: it is
 * unexported on purpose, and its own note says the dequeue mechanism belongs
 * with `dequeueQueueEntry`, which is what chooses between it and the household
 * path.
 *
 * The write-and-emit helper is imported rather than copied, so a publish can
 * never be made conditional for keyed updates and left unconditional elsewhere.
 */

import { and, eq, type SQL } from "drizzle-orm";
import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { buildQueuedQueueUpdate } from "@/lib/queue-status";
import { updateCampaignQueueAndEmit } from "@/lib/campaign-queue-db.server";

/**
 * Revert a claimed campaign_queue row back to `queued`. Used to release a
 * contact claimed by `claim_next_queue_contact` when the subsequent dial
 * attempt fails before a Twilio call is actually placed (e.g. the Twilio API
 * call itself throws) — otherwise the contact is stuck "assigned" forever
 * and the predictive dialer can never retry it.
 */
export async function requeueCampaignQueueById(
  queueId: number,
  workspaceId?: string,
) {
  const conditions: SQL[] = [eq(campaignQueueTable.id, queueId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildQueuedQueueUpdate(),
    workspaceId,
  });
}

export async function updateCampaignQueueByContactAndCampaign(args: {
  contactId: number;
  campaignId: number;
  update: Record<string, unknown>;
  workspaceId?: string;
}) {
  const conditions: SQL[] = [
    eq(campaignQueueTable.contact_id, args.contactId),
    eq(campaignQueueTable.campaign_id, args.campaignId),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: args.update,
    workspaceId: args.workspaceId,
  });
}

export async function requeueAllCampaignQueueForCampaign(
  campaignId: number,
  workspaceId?: string,
) {
  const conditions: SQL[] = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildQueuedQueueUpdate(),
    workspaceId,
  });
}
