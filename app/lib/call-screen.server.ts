import {
  COMPLETED_QUEUE_COUNT_FILTER,
  isAssignedToUser,
  isQueued,
} from "@/lib/queue-status";
import { SupabaseClient } from "@supabase/supabase-js";
import type { OutreachAttempt, QueueItem } from "@/lib/types";
import { logger } from "@/lib/logger.server";

export async function getCallScreenData(
  supabase: SupabaseClient,
  campaignId: string,
  workspaceId: string,
  userId: string,
) {
  const [
    workspaceData,
    campaign,
    campaignDetails,
    audiences,
    queueCount,
    completedCount,
    attempts,
  ] = await Promise.all([
    supabase.from("workspace").select("*").eq("id", workspaceId).single(),
    supabase.from("campaign").select().eq("id", parseInt(campaignId)).single(),
    supabase
      .from("live_campaign")
      .select(`*, script:script(*)`)
      .eq("campaign_id", parseInt(campaignId))
      .single(),
    supabase.rpc("get_audiences_by_campaign", { selected_campaign_id: parseInt(campaignId) }),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(campaignId)),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(campaignId))
      .or(COMPLETED_QUEUE_COUNT_FILTER),
    supabase
      .from("outreach_attempt")
      .select(`*, call:call(*)`)
      .eq("campaign_id", parseInt(campaignId))
      .eq("user_id", userId),
  ]);

  const errors = [
    workspaceData.error,
    campaign.error,
    campaignDetails.error,
    audiences.error,
    queueCount.error,
    completedCount.error,
    attempts.error,
  ].filter(Boolean);

  if (errors.length) {
    logger.error("Error fetching campaign data:", errors);
    throw "Error fetching campaign data";
  }
  return {
    workspaceData: workspaceData.data,
    campaign: campaign.data,
    campaignDetails: campaignDetails.data,
    audiences: audiences.data,
    queueCount: queueCount.count,
    completedCount: completedCount.count,
    attempts: attempts.data,
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
    throw "Invalid dial type";
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

export function getInitialRecentCall(attempts: OutreachAttempt[]) {
  return attempts.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

export function getInitialRecentAttempt(attempts: OutreachAttempt[]) {
  return attempts.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}
