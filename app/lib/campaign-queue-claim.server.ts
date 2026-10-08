import { and, eq, isNull, lte, or } from "drizzle-orm";

import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { SMS_CLAIM_LEASE_MS } from "@/lib/campaign-queue-claim";

/**
 * Writing the in-flight claim marker for the campaign queue (#2208).
 *
 * This lives apart from `campaign-queue-db.server.ts` because it is a
 * different kind of write: every function in that module moves a row through
 * its lifecycle and publishes an event for it, while this one stamps a lease
 * that says "a dispatcher has this row right now" and touches nothing else.
 * Keeping it separate also keeps the lifecycle module from growing a concern
 * that deliberately does NOT change `queue_state`.
 *
 * See `campaign-queue-claim.ts` for why the marker exists at all.
 */
export async function claimQueueEntryForSms(args: {
  queueId: number;
  workspaceId: string;
  tdb?: TenantDb;
}): Promise<boolean> {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  // A real `Date` on both sides. The column is `timestamptz` and the model now
  // says so (#2213), so the lease is compared as a timestamp rather than as
  // two strings — which is what made this safe to write in the first place,
  // and is no longer something to work around.
  const now = new Date();
  const staleBefore = new Date(Date.now() - SMS_CLAIM_LEASE_MS);

  /**
   * Deliberately a single conditional UPDATE rather than a call to
   * `updateCampaignQueueAndEmit`, which selects the row and then updates it.
   * That is a read-modify-write and loses the race between two dispatchers;
   * here the loser simply updates zero rows and learns it lost from the
   * boolean this returns, with no second round-trip to discover the conflict.
   *
   * `createTenantDb` already scopes the statement to the workspace, so the
   * claim cannot reach another tenant's row even if the id were wrong.
   */
  const claimed = await tdb.campaign_queue.update({
    set: { claimed_at: now },
    where: and(
      eq(campaignQueueTable.id, args.queueId),
      isNull(campaignQueueTable.dequeued_at),
      // A live claim blocks; an absent or expired one is up for grabs.
      or(
        isNull(campaignQueueTable.claimed_at),
        lte(campaignQueueTable.claimed_at, staleBefore),
      ),
    ),
  });

  return claimed.length > 0;
}
