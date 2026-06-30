import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import {
  applyQueueStatusFilter,
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
import { and, eq, inArray } from "drizzle-orm";

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
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignIdNum),
    applyQueueStatusFilter(
      supabase
        .from("campaign_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignIdNum),
      "completed",
    ),
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
    queueCount.error,
    completedCount.error,
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
    queueCount: queueCount.count,
    completedCount: completedCount.count,
    attempts,
  };
}

export async function getVerifiedNumbers(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user")
    .select("verified_audio_numbers")
    .eq("id", userId)
    .single();
  if (error) {
    logger.error("Error fetching verified numbers:", error);
    throw error;
  }
  return data?.verified_audio_numbers || [];
}

export async function getQueueByDialType(
  supabase: SupabaseClient,
  campaignId: string,
  dialType: string,
  userId: string,
) {
  let queue = [] as QueueItem[];
  const { data, error } = await supabase
    .from("campaign_queue")
    .select("*, contact(*)")
    .eq("campaign_id", parseInt(campaignId))
    .is("dequeued_at", null)
    .order("attempts", { ascending: true })
    .order("queue_order", { ascending: true })
    .limit(200);

  if (error) {
    logger.error(`Error fetching ${dialType} queue:`, error);
    throw error;
  }

  const rows = (data as unknown as QueueItem[]) ?? [];

  if (dialType === "predictive") {
    queue = rows.filter((item) => isQueued(item)).slice(0, 50);
  } else if (dialType === "call") {
    queue = rows.filter((item) => isAssignedToUser(item, userId)).slice(0, 50);
  } else {
    throw new Error("Invalid dial type");
  }
  return queue;
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
