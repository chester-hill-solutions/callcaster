/**
 * Campaign result stats use workspace-scoped Drizzle queries.
 */
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/lib/db-types";
import { Script } from "../types";
import { logger } from "../logger.server";
import {
  aggregateIvrResponses,
  campaignTypeCollectsIvrResponses,
  type IvrQuestionResults,
  type IvrScriptShape,
} from "@/lib/ivr-results";
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
  call as callTable,
  campaign_queue as campaignQueueTable,
  message as messageTable,
  outreach_attempt as outreachAttemptTable,
  script as scriptTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export async function fetchBasicResults({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignIdNum = Number(campaignId);
  let campaign: { type: string | null; dial_ratio: number } | undefined;
  try {
    campaign = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, campaignIdNum),
      columns: { type: true, dial_ratio: true },
    });
    if (campaign && campaign.type !== "message") {
      return await fetchCallResults({
        workspaceId,
        campaignId: campaignIdNum,
        dialRatio: campaign.dial_ratio,
        tdb,
      });
    }
  } catch (campaignError) {
    logger.error(
      "Error fetching campaign type for basic results:",
      campaignError,
    );
    return [];
  }

  if (!campaign) return [];
  const [queueCounts, messageStatuses, attemptDispositions] = await Promise.all(
    [
      fetchQueueCounts({ workspaceId, campaignId }),
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
    ],
  );

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

  const outcomeFallbackKeys = [
    "failed",
    "undelivered",
    "delivered",
    "sent",
  ] as const;
  for (const key of outcomeFallbackKeys) {
    if ((dispositionCounts[key] ?? 0) > 0) continue;
    if ((attemptDispositionCounts[key] ?? 0) > 0) {
      dispositionCounts[key] = attemptDispositionCounts[key] ?? 0;
    }
  }

  logger.info("Message campaign stats assembled", {
    campaignId,
    queuedCount: queueCounts.queuedCount ?? 0,
    groupedStatuses: dispositionCounts,
    groupedAttemptDispositions: attemptDispositionCounts,
  });

  const expectedTotal = queueCounts.fullCount ?? 0;
  const messageResults = Object.entries(dispositionCounts).map(
    ([disposition, count]) => ({
      disposition,
      count,
      average_call_duration: "00:00:00",
      average_wait_time: "00:00:00",
      expected_total: expectedTotal,
    }),
  );

  return messageResults;
}

// Keep the count and average-wait aggregates on outreach_attempt rows. Call
// legs join separately for duration so a parent and child leg cannot multiply
// attempts or weight their wait time more than once.
async function fetchCallResults({
  workspaceId,
  campaignId,
  dialRatio,
  tdb,
}: {
  workspaceId: string;
  campaignId: number;
  dialRatio: number;
  tdb: TenantDb;
}) {
  const attemptFilter = and(
    eq(outreachAttemptTable.workspace, workspaceId),
    eq(outreachAttemptTable.campaign_id, campaignId),
    isNotNull(outreachAttemptTable.disposition),
    ne(outreachAttemptTable.disposition, ""),
  );

  const durationSeconds = sql`CASE
    WHEN ${callTable.duration} IS NOT NULL
      AND ${callTable.duration} != ''
      AND ${callTable.duration} != '0'
      AND ${callTable.duration} ~ '^[0-9]+$'
    THEN ${callTable.duration}::numeric
    ELSE NULL
  END`;

  const [queueCount, attempts, durations] = await Promise.all([
    tdb.campaign_queue.count({
      where: eq(campaignQueueTable.campaign_id, campaignId),
    }),
    db
      .select({
        disposition: outreachAttemptTable.disposition,
        count: sql<number>`count(*)::integer`,
        average_wait_time: sql<string>`COALESCE(
          AVG(CASE
            WHEN ${outreachAttemptTable.answered_at} IS NOT NULL
              AND ${outreachAttemptTable.created_at} IS NOT NULL
              AND ${outreachAttemptTable.answered_at}::timestamptz > ${outreachAttemptTable.created_at}::timestamptz
            THEN ${outreachAttemptTable.answered_at}::timestamptz - ${outreachAttemptTable.created_at}::timestamptz
            ELSE NULL::interval
          END),
          interval '0 seconds'
        )`,
      })
      .from(outreachAttemptTable)
      .where(attemptFilter)
      .groupBy(outreachAttemptTable.disposition),
    db
      .select({
        disposition: outreachAttemptTable.disposition,
        average_call_duration: sql<string>`COALESCE(
          make_interval(secs => AVG(${durationSeconds})::double precision),
          interval '0 seconds'
        )`,
      })
      .from(outreachAttemptTable)
      .leftJoin(
        callTable,
        eq(callTable.outreach_attempt_id, outreachAttemptTable.id),
      )
      .where(attemptFilter)
      .groupBy(outreachAttemptTable.disposition),
  ]);

  const durationsByDisposition = new Map(
    durations.map((row) => [row.disposition, row.average_call_duration]),
  );
  const expectedTotal = queueCount * dialRatio;
  return attempts
    .map((row) => ({
      disposition: row.disposition ?? "Unknown",
      count: row.count,
      average_call_duration:
        durationsByDisposition.get(row.disposition) ?? "00:00:00",
      average_wait_time: row.average_wait_time ?? "00:00:00",
      expected_total: expectedTotal,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Per-question IVR response counts for a campaign.
 *
 * `get_campaign_stats` only aggregates `outreach_attempt.disposition`, so the
 * responses written to `outreach_attempt.result` need a separate read to reach
 * the results screen.
 */
export async function fetchIvrResponseResults({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  tdb?: TenantDb;
}): Promise<IvrQuestionResults[]> {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignIdNum = Number(campaignId);

  try {
    const campaign = await tdb.campaign.findFirst({
      where: eq(campaignTable.id, campaignIdNum),
      columns: { type: true, script_id: true },
    });
    if (!campaignTypeCollectsIvrResponses(campaign?.type)) {
      return [];
    }

    const [attempts, script] = await Promise.all([
      tdb.outreach_attempt.findMany({
        where: and(
          eq(outreachAttemptTable.campaign_id, campaignIdNum),
          isNotNull(outreachAttemptTable.result),
        ),
        columns: { result: true },
      }),
      campaign?.script_id
        ? tdb.script.findFirst({
            where: eq(scriptTable.id, campaign.script_id),
            columns: { steps: true },
          })
        : null,
    ]);

    return aggregateIvrResponses(
      attempts,
      (script?.steps as IvrScriptShape) ?? null,
    );
  } catch (error) {
    logger.error("Error fetching IVR response results:", error);
    return [];
  }
}

export async function fetchCampaignCounts({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
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
}) {
  const campaignIdNum = Number(campaignId);
  const [fullCount, queuedCount, completedCount] = await Promise.all([
    countDialableCampaignQueueRows(campaignIdNum),
    countDialableQueuedCampaignQueueRows(campaignIdNum),
    countDialableCompletedCampaignQueueRows(campaignIdNum),
  ]);

  return {
    fullCount,
    queuedCount,
    completedCount,
  };
}

export async function fetchCampaignAudience({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  tdb?: TenantDb;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignIdNum = Number(campaignId);

  const [campaignQueue, queueCount, dequeuedCount, totalCount, scripts] =
    await Promise.all([
      fetchDialableCampaignQueueWithContacts({
        campaignId: campaignIdNum,
        limit: 25,
      }),
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
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string | number;
  campaignType:
    "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr";
  /** Storage signed URLs for message media */
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
      const message =
        scriptError instanceof Error ? scriptError.message : "Unknown error";
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

  if (
    campaignType === "message" &&
    Array.isArray(data.message_media) &&
    data.message_media.length
  ) {
    data.mediaLinks = await getSignedUrls(workspaceId, data.message_media);
  }

  return data;
}
