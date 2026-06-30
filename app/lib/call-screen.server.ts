import { and, eq, inArray } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import {
  countCampaignQueueRows,
  countCompletedCampaignQueueRows,
  fetchActiveCampaignQueueWithContacts,
} from "@/lib/campaign-queue-search.server";
import {
  isAssignedToUser,
  isQueued,
} from "@/lib/queue-status";
import { SupabaseClient } from "@supabase/supabase-js";
import type { OutreachAttempt, QueueItem } from "@/lib/types";
import { logger } from "@/lib/logger.server";
import { fetchCampaignWithScriptForWorkspace } from "@/lib/campaign-ivr.server";
import {
  call as callTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { getUserById } from "@/lib/workspace-members-db.server";

export async function getCallScreenData(
  supabase: SupabaseClient,
  campaignId: string,
  workspaceId: string,
  userId: string,
) {
  const tdb = createTenantDb(workspaceId);
  const campaignIdNum = parseInt(campaignId);

  const [
    workspaceData,
    campaignWithScript,
    audiences,
    queueCount,
    completedCount,
    attemptRows,
  ] = await Promise.all([
    adminDb.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1).then((rows) => ({
      data: rows[0] ?? null,
      error: rows[0] ? null : { message: "Workspace not found" },
    })),
    fetchCampaignWithScriptForWorkspace(workspaceId, campaignIdNum).catch((error) => {
      logger.error("Error fetching campaign data:", error);
      return null;
    }),
    supabase.rpc("get_audiences_by_campaign", { selected_campaign_id: campaignIdNum }),
    countCampaignQueueRows(campaignIdNum),
    countCompletedCampaignQueueRows(campaignIdNum),
    tdb.outreach_attempt.findMany({
      where: and(
        eq(outreachAttemptTable.campaign_id, campaignIdNum),
        eq(outreachAttemptTable.user_id, userId),
      ),
    }),
  ]);

  let attempts: OutreachAttempt[] = [];
  if (attemptRows.length > 0) {
    const attemptIds = attemptRows.map((row) => row.id);
    const callRows = await tdb.call.findMany({
      where: inArray(callTable.outreach_attempt_id, attemptIds),
    });
    attempts = attemptRows.map((attempt) => ({
      ...attempt,
      call: callRows.filter((call) => call.outreach_attempt_id === attempt.id),
    })) as OutreachAttempt[];
  }

  const errors = [
    workspaceData.error,
    campaignWithScript ? null : new Error("Campaign not found"),
    audiences.error,
  ].filter(Boolean);

  if (errors.length) {
    logger.error("Error fetching campaign data:", errors);
    throw new Error("Error fetching campaign data");
  }

  const campaign = campaignWithScript!;
  return {
    workspaceData: workspaceData.data,
    campaign,
    campaignDetails: campaign,
    audiences: audiences.data,
    queueCount,
    completedCount,
    attempts,
  };
}

export async function getVerifiedNumbers(_supabase: SupabaseClient, userId: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user.verified_audio_numbers || [];
}

export async function getQueueByDialType(
  _supabase: SupabaseClient,
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
    return queueItems.filter((item) => isAssignedToUser(item, userId)).slice(0, 50);
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
  return attempts.flatMap((attempt) => attempt.call);
}

function getMostRecentAttempt(attempts: OutreachAttempt[]) {
  return [...attempts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

export function getInitialRecentCall(attempts: OutreachAttempt[]) {
  return getMostRecentAttempt(attempts);
}

export function getInitialRecentAttempt(attempts: OutreachAttempt[]) {
  return getMostRecentAttempt(attempts);
}
