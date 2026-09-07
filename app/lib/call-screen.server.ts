import { and, eq, inArray } from "drizzle-orm";
import { workspace ,
  call as callTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import {
  countCampaignQueueRows,
  countCompletedCampaignQueueRows,
  fetchActiveCampaignQueueWithContacts,
} from "@/lib/campaign-queue-search.server";
import {
  getAssignedUserId,
  isAssignedToUser,
  isQueued,
} from "@/lib/queue-status";
import type { Call, OutreachAttempt, QueueItem } from "@/lib/types";
import { rpcGetAudiencesByCampaign, type AudienceByCampaignRow } from "@/lib/db-rpc.server";
import { logger } from "@/lib/logger.server";
import { fetchCampaignWithScriptForWorkspace } from "@/lib/campaign-ivr.server";
import { createTenantDb } from "@/server/tenant-db";
import { getUserById } from "@/lib/workspace-members-db.server";
import { normalizeDispositionOptions } from "@/lib/outreach-disposition";

type CampaignWithScript = NonNullable<
  Awaited<ReturnType<typeof fetchCampaignWithScriptForWorkspace>>
>;

/** Everything the call screen loads, with existence already established (roadmap E6.2). */
export type CallScreenData = {
  workspaceData: typeof workspace.$inferSelect;
  campaign: CampaignWithScript;
  campaignDetails: CampaignWithScript & {
    disposition_options: ReturnType<typeof normalizeDispositionOptions>;
  };
  audiences: AudienceByCampaignRow[];
  queueCount: number;
  completedCount: number;
  attempts: OutreachAttempt[];
};

/**
 * Load the call screen's data. Validates the workspace, campaign, and audience
 * lookups here, so callers receive non-null values and never repeat the checks;
 * a missing row or a failed lookup throws with the same message the loaders
 * already handle.
 */
export async function getCallScreenData(
  campaignId: string,
  workspaceId: string,
  userId: string,
): Promise<CallScreenData> {
  const tdb = createTenantDb(workspaceId);
  const campaignIdNum = parseInt(campaignId);

  const [workspaceRows, campaignWithScript, audiences, queueCount, completedCount, attemptRows] =
    await Promise.all([
      adminDb.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1),
      fetchCampaignWithScriptForWorkspace(workspaceId, campaignIdNum).catch((error) => {
        logger.error("Error fetching campaign data:", error);
        return null;
      }),
      rpcGetAudiencesByCampaign(campaignIdNum),
      countCampaignQueueRows(campaignIdNum),
      countCompletedCampaignQueueRows(campaignIdNum),
      tdb.outreach_attempt.findMany({
        where: and(
          eq(outreachAttemptTable.campaign_id, campaignIdNum),
          eq(outreachAttemptTable.user_id, userId),
        ),
      }),
    ]);

  const workspaceData = workspaceRows[0] ?? null;
  const problems = [
    workspaceData ? null : "Workspace not found",
    campaignWithScript ? null : "Campaign not found",
    audiences.error ? audiences.error.message : null,
  ].filter((problem): problem is string => problem !== null);
  if (problems.length > 0 || !workspaceData || !campaignWithScript || audiences.data === null) {
    logger.error("Error fetching campaign data:", problems);
    throw new Error("Error fetching campaign data");
  }

  const attempts = await loadAttemptsWithCalls(tdb, attemptRows);
  const campaign = campaignWithScript;
  return {
    workspaceData,
    campaign,
    campaignDetails: {
      ...campaign,
      disposition_options: normalizeDispositionOptions(campaign.disposition_options),
    },
    audiences: audiences.data,
    queueCount,
    completedCount,
    attempts,
  };
}

type OutreachAttemptRow = typeof outreachAttemptTable.$inferSelect;

/** Attach each attempt's call rows; typed through the schema instead of a blind cast. */
async function loadAttemptsWithCalls(
  tdb: ReturnType<typeof createTenantDb>,
  attemptRows: OutreachAttemptRow[],
): Promise<OutreachAttempt[]> {
  if (attemptRows.length === 0) return [];
  const callRows = await tdb.call.findMany({
    where: inArray(
      callTable.outreach_attempt_id,
      attemptRows.map((row) => row.id),
    ),
  });
  return attemptRows.map((attempt) => ({
    ...attempt,
    call: callRows.filter((call) => call.outreach_attempt_id === attempt.id),
  }));
}

export async function getVerifiedNumbers(userId: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user.verified_audio_numbers || [];
}

export async function getQueueByDialType(
  campaignId: string,
  dialType: string,
  userId: string,
) {
  const rows = await fetchActiveCampaignQueueWithContacts({
    campaignId: parseInt(campaignId, 10),
    limit: 200,
  });
  const queueItems = rows as unknown as QueueItem[];

  if (dialType === "predictive") {
    return queueItems.filter((item) => isQueued(item)).slice(0, 50);
  }
  if (dialType === "call") {
    // Manual dialing works off a shared queue. Enqueue (rpcHandleCampaignQueueEntry)
    // never assigns a user, so rows land unassigned + queued. Filtering to only
    // rows already assigned to this operator left `nextRecipient` null for every
    // fresh manual campaign — the header showed "N remaining" but the Dial button
    // stayed disabled (#1099). Include unassigned queued rows so the operator has
    // a next contact to dial; keep this operator's own assigned rows so an
    // in-progress row is never dropped. Rows assigned to another operator are
    // excluded to avoid two operators dialing the same contact.
    return queueItems
      .filter(
        (item) =>
          isAssignedToUser(item, userId) ||
          (getAssignedUserId(item) === null && isQueued(item)),
      )
      .slice(0, 50);
  }
  throw new Error("Invalid dial type");
}

export function getNextRecipient(queue: QueueItem[], dialType: string, userId: string) {
  if (dialType === "predictive") {
    return null;
  }
  if (dialType === "call") {
    return queue[0] ?? null;
  }
  return null;
}

export function getInitialCallsList(attempts: OutreachAttempt[]) {
  return attempts.flatMap((attempt) =>
    Array.isArray(attempt.call) ? attempt.call : [attempt.call]
  );
}

function getMostRecentAttempt(
  attempts: OutreachAttempt[],
  nextRecipient: QueueItem | null,
): OutreachAttempt | null {
  if (!nextRecipient) return null;

  return [...attempts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ).find((attempt) => attempt.contact_id === nextRecipient.contact_id) ?? null;
}

export function getInitialRecentCall(
  attempts: OutreachAttempt[],
  nextRecipient: QueueItem | null,
): Call | null {
  const recentAttempt = getMostRecentAttempt(attempts, nextRecipient);
  if (!recentAttempt) return null;

  const calls = Array.isArray(recentAttempt.call)
    ? recentAttempt.call
    : [recentAttempt.call];
  return [...calls].sort((a, b) => {
    const aDate = a.date_created ?? a.start_time ?? a.date_updated ?? "";
    const bDate = b.date_created ?? b.start_time ?? b.date_updated ?? "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  })[0] ?? null;
}

export function getInitialRecentAttempt(
  attempts: OutreachAttempt[],
  nextRecipient: QueueItem | null,
): OutreachAttempt | null {
  return getMostRecentAttempt(attempts, nextRecipient);
}
