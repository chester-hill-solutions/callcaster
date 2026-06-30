/**
 * Campaign stats and aggregated reads (tenant-db for scoped tables; Supabase for RPC only).
 */
import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Script } from "../types";
import { logger } from "../logger.server";
import { getSignedUrls } from "./workspace.server";
import {
  countCampaignQueueRows,
  countDialableCampaignQueueRows,
  countDialableCompletedCampaignQueueRows,
  countDialableQueuedCampaignQueueRows,
  fetchDialableCampaignQueueWithContacts,
} from "../campaign-queue-search.server";
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
  /** RPC `get_campaign_stats` */
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

  const campaignIdNum = Number(campaignId);
  const [queueCounts, completedQueueCount, messageStatuses, attemptDispositions] =
    await Promise.all([
      fetchQueueCounts({ workspaceId, campaignId }),
      countDialableCompletedCampaignQueueRows(campaignIdNum),
      tdb.message.findMany({
        where: and(
          eq(messageTable.campaign_id, campaignIdNum),
          isNotNull(messageTable.status),
        ),
        columns: { status: true },
      }),
      tdb.outreach_attempt.findMany({
        where: and(
          eq(outreachAttemptTable.campaign_id, campaignIdNum),
          isNotNull(outreachAttemptTable.disposition),
          ne(outreachAttemptTable.disposition, ""),
        ),
        columns: { disposition: true },
      }),
    ]);

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

  const outcomeFallbackKeys = ["failed", "undelivered", "delivered", "sent"] as const;
  for (const key of outcomeFallbackKeys) {
    if ((dispositionCounts[key] ?? 0) > 0) continue;
    if ((attemptDispositionCounts[key] ?? 0) > 0) {
      dispositionCounts[key] = attemptDispositionCounts[key] ?? 0;
    }
  }

  dispositionCounts.queued = queueCounts.queuedCount ?? 0;
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
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  /** @deprecated Supabase no longer used; kept for call-site compatibility */
  supabaseClient?: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignIdNum = Number(campaignId);

  let callCount: number | null = null;
  let callCountError: unknown = null;
  try {
    callCount = await tdb.outreach_attempt.count({
      where: eq(outreachAttemptTable.campaign_id, campaignIdNum),
    });
  } catch (error) {
    callCountError = error;
  }

  let queueCount: number | null = null;
  let queueCountError: unknown = null;
  try {
    queueCount = await countCampaignQueueRows(campaignIdNum);
  } catch (error) {
    queueCountError = error;
  }

  if (queueCountError) {
    logger.error("Error fetching campaign counts:", queueCountError);
  }
  if (callCountError) {
    logger.error("Error fetching call counts:", callCountError);
  }

  return {
    callCount: queueCount,
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
  workspaceId: _workspaceId,
  campaignId,
}: {
  workspaceId: string;
  campaignId: string;
  /** @deprecated Supabase no longer used; kept for call-site compatibility */
  supabaseClient?: SupabaseClient<Database>;
}) {
  const campaignIdNum = Number(campaignId);
  const [fullCount, queuedCount] = await Promise.all([
    countDialableCampaignQueueRows(campaignIdNum),
    countDialableQueuedCampaignQueueRows(campaignIdNum),
  ]);

  return {
    fullCount,
    queuedCount,
  };
}

export async function fetchCampaignAudience({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  /** @deprecated Supabase no longer used; kept for call-site compatibility */
  supabaseClient?: SupabaseClient<Database>;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignIdNum = Number(campaignId);

  const [campaignQueue, queueCount, dequeuedCount, totalCount, scripts] = await Promise.all([
    fetchDialableCampaignQueueWithContacts({ campaignId: campaignIdNum, limit: 25 }),
    countDialableQueuedCampaignQueueRows(campaignIdNum),
    countDialableCompletedCampaignQueueRows(campaignIdNum),
    countDialableCampaignQueueRows(campaignIdNum),
    tdb.script.findMany({}),
  ]);

  return {
    campaign_queue: campaignQueue,
    queue_count: queueCount,
    dequeued_count: dequeuedCount,
    total_count: totalCount,
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
