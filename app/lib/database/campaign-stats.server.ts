import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Script } from "../types";
import { logger } from "../logger.server";
import { getSignedUrls } from "./workspace.server";
import {
  COMPLETED_QUEUE_COUNT_FILTER,
  QUEUE_STATUS_QUEUED,
} from "../queue-status";

type CampaignTableKey = "live_campaign" | "message_campaign" | "ivr_campaign";

export const fetchBasicResults = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { data, error } = await supabaseClient.rpc("get_campaign_stats", {
    campaign_id_param: campaignId,
  });
  if (error) logger.error("Error fetching basic results:", error);
  const baseResults = ((data as
    | {
        disposition: string;
        count: number;
        average_call_duration: string;
        average_wait_time: string;
        expected_total: number;
      }[]
    | null) ?? []);

  const { data: campaign } = await supabaseClient
    .from("campaign")
    .select("type")
    .eq("id", Number(campaignId))
    .maybeSingle();

  if (campaign?.type !== "message") {
    return baseResults;
  }

  const [queueCounts, completedQueueResult, messageStatuses, attemptDispositions] = await Promise.all([
    fetchQueueCounts(supabaseClient as SupabaseClient<Database>, campaignId),
    supabaseClient
      .from("campaign_queue")
      .select("id, contact!inner(*)", { count: "exact", head: true })
      .eq("campaign_id", Number(campaignId))
      .or(COMPLETED_QUEUE_COUNT_FILTER)
      .not("contact.phone", "is", null)
      .neq("contact.phone", "")
      .limit(1),
    supabaseClient
      .from("message")
      .select("status")
      .eq("campaign_id", Number(campaignId))
      .not("status", "is", null),
    supabaseClient
      .from("outreach_attempt")
      .select("disposition")
      .eq("campaign_id", Number(campaignId))
      .not("disposition", "is", null)
      .neq("disposition", ""),
  ]);

  if (completedQueueResult.error) {
    logger.error("Error fetching completed queue count for message stats:", completedQueueResult.error);
  }
  if (messageStatuses.error) {
    logger.error("Error fetching message statuses for message stats:", messageStatuses.error);
  }
  if (attemptDispositions.error) {
    logger.error(
      "Error fetching outreach attempt dispositions for message stats:",
      attemptDispositions.error,
    );
  }

  const dispositionCounts = (messageStatuses.data ?? []).reduce(
    (acc, row) => {
      const disposition = row.status?.trim().toLowerCase();
      if (!disposition) return acc;
      acc[disposition] = (acc[disposition] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const attemptDispositionCounts = (attemptDispositions.data ?? []).reduce(
    (acc, row) => {
      const disposition = row.disposition?.trim().toLowerCase();
      if (!disposition) return acc;
      acc[disposition] = (acc[disposition] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Backfill key outcome buckets from outreach_attempt when message.status lacks them.
  const outcomeFallbackKeys = ["failed", "undelivered", "delivered", "sent"] as const;
  for (const key of outcomeFallbackKeys) {
    if ((dispositionCounts[key] ?? 0) > 0) continue;
    if ((attemptDispositionCounts[key] ?? 0) > 0) {
      dispositionCounts[key] = (attemptDispositionCounts[key] ?? 0);
    }
  }

  // Align queued with settings queue semantics.
  dispositionCounts[QUEUE_STATUS_QUEUED] = queueCounts.queuedCount ?? 0;
  const completedQueueCount = completedQueueResult.count ?? 0;
  if (completedQueueCount > 0 && dispositionCounts.dequeued == null) {
    dispositionCounts.dequeued = completedQueueCount;
  }

  logger.info("Message campaign stats assembled", {
    campaignId,
    queuedCount: queueCounts.queuedCount ?? 0,
    completedQueueCount,
    groupedStatuses: dispositionCounts,
    groupedAttemptDispositions: attemptDispositionCounts,
  });

  const expectedTotal = queueCounts.fullCount ?? Number(baseResults[0]?.expected_total ?? 0);
  const messageResults = Object.entries(dispositionCounts).map(
    ([disposition, count]) => ({
      disposition,
      count,
      average_call_duration: "00:00:00",
      average_wait_time: "00:00:00",
      expected_total: expectedTotal,
    }),
  );

  return messageResults.length > 0 ? messageResults : baseResults;
};

export const fetchCampaignCounts = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { count, error } = await supabaseClient
    .from("campaign_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  const { count: callCount, error: callCountError } = await supabaseClient
    .from("outreach_attempt")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) {
    logger.error("Error fetching campaign counts:", error);
  }
  if (callCountError) {
    logger.error("Error fetching call counts:", callCountError);
  }

  return {
    callCount: count,
    completedCount: callCount,
  };
};

export const fetchCampaignData = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select(
      `
      *,
      campaign_audience(*)
    `,
    )
    .eq("id", campaignId)
    .single();
  if (error) logger.error("Error fetching campaign data:", error);
  return data;
};

export const fetchCampaignDetails = async (
  supabaseClient: SupabaseClient,
  campaignId: string | number,
  workspaceId: string,
  _legacyTableName?: CampaignTableKey,
) => {
  const { data: row, error } = await supabaseClient
    .from("campaign")
    .select(
      "id, script_id, body_text, message_media, voicedrop_audio, disposition_options, live_questions, workspace, type",
    )
    .eq("id", Number(campaignId))
    .eq("workspace", workspaceId)
    .maybeSingle();

  if (error) {
    logger.error("Error fetching campaign details:", error);
    return null;
  }

  if (!row) {
    return null;
  }

  return {
    campaign_id: row.id,
    script_id: row.script_id,
    body_text: row.body_text,
    message_media: row.message_media,
    voicedrop_audio: row.voicedrop_audio,
    disposition_options: row.disposition_options,
    questions: row.live_questions,
    workspace: row.workspace,
  };
};

export const fetchQueueCounts = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string,
) => {
  const { error: fullCountError, count: fullCountCount } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact!inner(*)", { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const { error: queuedCountError, count: queuedCountCount } =
    await supabaseClient
      .from("campaign_queue")
      .select("*, contact!inner(*)", { count: "exact", head: true })
      .eq("campaign_id", Number(campaignId))
      .eq("status", QUEUE_STATUS_QUEUED)
      .not("contact.phone", "is", null)
      .neq("contact.phone", "")
      .limit(1);

  if (fullCountError)
    throw new Error(
      `Error fetching full count: ${fullCountError?.message || "Unknown error fetching full count"}`,
    );
  if (queuedCountError)
    throw new Error(
      `Error fetching queued count: ${queuedCountError?.message || "Unknown error fetching queued count"}`,
    );

  return {
    fullCount: fullCountCount,
    queuedCount: queuedCountCount,
  };
};

export const fetchCampaignAudience = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
) => {
  const scriptsPromise = supabaseClient
    .from("script")
    .select(`*`)
    .eq("workspace", workspaceId);

  const queuePromise = supabaseClient
    .from("campaign_queue")
    .select(`*, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(25);

  const isQueuedCountPromise = supabaseClient
    .from("campaign_queue")
    .select(`id, contact_id, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .eq("status", QUEUE_STATUS_QUEUED)
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const dequeuedCountPromise = supabaseClient
    .from("campaign_queue")
    .select(`id, contact_id, contact!inner(*)`, { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .or(COMPLETED_QUEUE_COUNT_FILTER)
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const [queueResult, isQueuedCount, dequeuedCount, scripts] = await Promise.all([
    queuePromise,
    isQueuedCountPromise,
    dequeuedCountPromise,
    scriptsPromise,
  ]);

  if (queueResult.error)
    throw new Error(`Error fetching queue data: ${queueResult.error.message}`);
  if (isQueuedCount.error)
    throw new Error(
      `Error fetching queued count: ${isQueuedCount.error.message}`,
    );
  if (dequeuedCount.error)
    throw new Error(
      `Error fetching dequeued count: ${dequeuedCount.error.message}`,
    );
  if (scripts.error)
    throw new Error(`Error fetching scripts: ${scripts.error.message}`);
  return {
    campaign_queue: queueResult.data,
    queue_count: isQueuedCount.count,
    dequeued_count: dequeuedCount.count,
    total_count: queueResult.count,
    scripts: scripts.data,
  };
};

export const fetchAdvancedCampaignDetails = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
  campaignType: "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr",
  workspaceId: string,
) => {
  const { data: row, error } = await supabaseClient
    .from("campaign")
    .select("*, script(*)")
    .eq("id", Number(campaignId))
    .eq("workspace", workspaceId)
    .single();

  if (error) throw new Error(`Error fetching campaign details: ${error.message}`);

  const data = {
    campaign_id: row.id,
    script_id: row.script_id,
    body_text: row.body_text,
    message_media: row.message_media,
    voicedrop_audio: row.voicedrop_audio,
    disposition_options: row.disposition_options,
    questions: row.live_questions,
    workspace: row.workspace,
    script: (Array.isArray(row.script) ? row.script[0] : row.script) as Script | null,
    mediaLinks: undefined as string[] | undefined,
  };

  if (campaignType === "message" && Array.isArray(data.message_media) && data.message_media.length) {
    data.mediaLinks = await getSignedUrls(
      supabaseClient,
      workspaceId,
      data.message_media,
    );
  }

  return data;
};
