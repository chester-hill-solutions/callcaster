/**
 * Campaign stats and aggregated reads (tenant-db for scoped tables; Supabase for RPC/queue).
 */
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Script } from "../types";
import { logger } from "../logger.server";
import { getSignedUrls } from "./workspace.server";
import {
  COMPLETED_QUEUE_COUNT_FILTER,
  applyQueueStatusFilter,
} from "../queue-status";
import {
  campaign as campaignTable,
  campaign_audience as campaignAudienceTable,
  message as messageTable,
  outreach_attempt as outreachAttemptTable,
  script as scriptTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export async function fetchBasicResults({
  workspaceId,
  campaignId,
  supabaseClient,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  /** RPC `get_campaign_stats` and `campaign_queue` queries */
  supabaseClient: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const { data, error } = await supabaseClient.rpc("get_campaign_stats", {
    campaign_id_param: campaignId,
  });
  if (error) logger.error("Error fetching basic results:", error);
  const baseResults =
    (data as
      | {
          disposition: string;
          count: number;
          average_call_duration: string;
          average_wait_time: string;
          expected_total: number;
        }[]
      | null) ?? [];

  let campaignType: string | null | undefined;
  try {
    const campaign = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(campaignId)),
      columns: { type: true },
    });
    campaignType = campaign?.type;
  } catch (campaignError) {
    logger.error("Error fetching campaign type for basic results:", campaignError);
  }

  if (campaignType !== "message") {
    return baseResults;
  }

  const [queueCounts, completedQueueResult, messageStatuses, attemptDispositions] =
    await Promise.all([
      fetchQueueCounts({ workspaceId, campaignId, supabaseClient }),
      supabaseClient
        .from("campaign_queue")
        .select("id, contact!inner(*)", { count: "exact", head: true })
        .eq("campaign_id", Number(campaignId))
        .or(COMPLETED_QUEUE_COUNT_FILTER)
        .not("contact.phone", "is", null)
        .neq("contact.phone", "")
        .limit(1),
      tdb.message.findMany({
        where: and(
          eq(messageTable.campaign_id, Number(campaignId)),
          isNotNull(messageTable.status),
        ),
        columns: { status: true },
      }),
      tdb.outreach_attempt.findMany({
        where: and(
          eq(outreachAttemptTable.campaign_id, Number(campaignId)),
          isNotNull(outreachAttemptTable.disposition),
          ne(outreachAttemptTable.disposition, ""),
        ),
        columns: { disposition: true },
      }),
    ]);

  if (completedQueueResult.error) {
    logger.error(
      "Error fetching completed queue count for message stats:",
      completedQueueResult.error,
    );
  }

  const dispositionCounts = messageStatuses.reduce(
    (acc, row) => {
      const disposition = row.status?.trim().toLowerCase();
      if (!disposition) return acc;
      acc[disposition] = (acc[disposition] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const attemptDispositionCounts = attemptDispositions.reduce(
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
      dispositionCounts[key] = attemptDispositionCounts[key] ?? 0;
    }
  }

  // Align queued with settings queue semantics.
  dispositionCounts.queued = queueCounts.queuedCount ?? 0;
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
}

export async function fetchCampaignCounts({
  workspaceId,
  campaignId,
  supabaseClient,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  /** `campaign_queue` counts */
  supabaseClient: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const { count, error } = await supabaseClient
    .from("campaign_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  let callCount: number | null = null;
  let callCountError: unknown = null;
  try {
    callCount = await tdb.outreach_attempt.count({
      where: eq(outreachAttemptTable.campaign_id, Number(campaignId)),
    });
  } catch (error) {
    callCountError = error;
  }

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
}

export async function fetchCampaignData({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  try {
    const row = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(campaignId)),
    });
    if (!row) {
      return null;
    }

    const campaignAudience = await db
      .select()
      .from(campaignAudienceTable)
      .where(eq(campaignAudienceTable.campaign_id, Number(campaignId)));

    return { ...row, campaign_audience: campaignAudience };
  } catch (error) {
    logger.error("Error fetching campaign data:", error);
    return null;
  }
}

export async function fetchCampaignDetails({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string | number;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  try {
    const row = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(campaignId)),
      columns: {
        id: true,
        script_id: true,
        body_text: true,
        message_media: true,
        voicedrop_audio: true,
        disposition_options: true,
        live_questions: true,
        workspace: true,
        type: true,
      },
    });

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
  } catch (error) {
    logger.error("Error fetching campaign details:", error);
    return null;
  }
}

export async function fetchQueueCounts({
  workspaceId,
  campaignId,
  supabaseClient,
}: {
  workspaceId: string;
  campaignId: string;
  /** `campaign_queue` counts */
  supabaseClient: SupabaseClient<Database>;
}) {
  const { error: fullCountError, count: fullCountCount } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact!inner(*)", { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const { error: queuedCountError, count: queuedCountCount } =
    await applyQueueStatusFilter(
      supabaseClient
        .from("campaign_queue")
        .select("*, contact!inner(*)", { count: "exact", head: true })
        .eq("campaign_id", Number(campaignId))
        .not("contact.phone", "is", null)
        .neq("contact.phone", ""),
      "queued",
    ).limit(1);

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
}

export async function fetchCampaignAudience({
  workspaceId,
  campaignId,
  supabaseClient,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  /** `campaign_queue` queries */
  supabaseClient: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const queuePromise = supabaseClient
    .from("campaign_queue")
    .select(`*, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(25);

  const isQueuedCountPromise = applyQueueStatusFilter(
    supabaseClient
      .from("campaign_queue")
      .select(`id, contact_id, contact!inner(*)`, { count: "exact" })
      .eq("campaign_id", Number(campaignId))
      .not("contact.phone", "is", null)
      .neq("contact.phone", ""),
    "queued",
  ).limit(1);

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
    tdb.script.findMany({}),
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

  return {
    campaign_queue: queueResult.data,
    queue_count: isQueuedCount.count,
    dequeued_count: dequeuedCount.count,
    total_count: queueResult.count,
    scripts,
  };
}

export async function fetchAdvancedCampaignDetails({
  workspaceId,
  campaignId,
  campaignType,
  supabaseClient,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string | number;
  campaignType: "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr";
  /** Storage signed URLs for message media */
  supabaseClient: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  let row;
  try {
    row = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(campaignId)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Error fetching campaign details: ${message}`);
  }

  if (!row) {
    throw new Error("Error fetching campaign details: Campaign not found");
  }

  let script: Script | null = null;
  if (row.script_id) {
    try {
      script = (await tdb.script.findFirst({
        where: eq(scriptTable.id, row.script_id),
      })) as Script | null;
    } catch (scriptError) {
      const message = scriptError instanceof Error ? scriptError.message : "Unknown error";
      throw new Error(`Error fetching campaign details: ${message}`);
    }
  }

  const data = {
    campaign_id: row.id,
    script_id: row.script_id,
    body_text: row.body_text,
    message_media: row.message_media,
    voicedrop_audio: row.voicedrop_audio,
    disposition_options: row.disposition_options,
    questions: row.live_questions,
    workspace: row.workspace,
    script,
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
}
