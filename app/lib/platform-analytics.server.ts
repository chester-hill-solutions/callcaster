import {
  fetchBasicResults,
  fetchQueueCounts,
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  generateCampaignExportId,
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { loadWorkspaceAnalytics } from "@/lib/workspace-analytics.server";
import { buildSurveyResponsesCsv as buildSurveyResponsesCsvFromDb } from "@/lib/survey-db.server";
import type { Database } from "@/lib/database.types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { campaign as campaignTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

export type SerializedExportItem = {
  id: string;
  created_at: string;
  download_url?: string;
  campaign_id: string;
  campaign_name: string;
  expires_at: string;
  is_expired: boolean;
  status: string;
  progress: number;
  stage?: string;
  processed?: number;
  total?: number;
};

export async function getWorkspaceAnalyticsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  requestUrl: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const role = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const canViewAllUsers =
    role?.role === MemberRole.Admin ||
    role?.role === MemberRole.Owner ||
    role?.role === MemberRole.Member;

  const analytics = await loadWorkspaceAnalytics({
    supabaseClient,
    workspaceId,
    requestUrl,
    currentUserId: userId,
    canViewAllUsers,
  });

  return { ok: true as const, analytics };
}

export async function getCampaignResultsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  campaignId: string,
) {
  const [campaign] = await db
    .select({
      id: campaignTable.id,
      workspace: campaignTable.workspace,
      title: campaignTable.title,
      type: campaignTable.type,
    })
    .from(campaignTable)
    .where(eq(campaignTable.id, Number(campaignId)))
    .limit(1);

  if (!campaign?.workspace) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  const workspaceId = campaign.workspace;
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const [results, queueCounts] = await Promise.all([
    fetchBasicResults({ workspaceId, campaignId, supabaseClient }),
    fetchQueueCounts({ workspaceId, campaignId, supabaseClient }),
  ]);

  return {
    ok: true as const,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      type: campaign.type,
      workspace_id: campaign.workspace,
    },
    results: results ?? [],
    queue_counts: queueCounts,
  };
}

export async function listWorkspaceExportsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const { data: files, error: listError } = await supabaseClient.storage
    .from("campaign-exports")
    .list(workspaceId, {
      sortBy: { column: "created_at", order: "desc" },
    });

  if (listError) {
    logger.error("listWorkspaceExportsApi error", listError);
    return { ok: false as const, error: listError.message, status: 500 };
  }

  const now = Date.now();
  const statusFiles = (files ?? []).filter((file) => file.name.endsWith(".json"));

  const processedExports = await Promise.all(
    statusFiles.map(async (file) => {
      try {
        const { data: statusData, error: downloadError } = await supabaseClient.storage
          .from("campaign-exports")
          .download(`${workspaceId}/${file.name}`);

        if (downloadError) {
          logger.error(`Error downloading export status ${file.name}`, downloadError);
          return null;
        }

        const content = JSON.parse(await statusData.text());
        const createdAt = new Date(content.created_at || file.created_at || Date.now());
        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: file.name.replace(".json", ""),
          created_at: createdAt.toISOString(),
          download_url: content.downloadUrl as string | undefined,
          campaign_id: String(content.campaignId ?? ""),
          campaign_name: (content.campaignName as string | undefined) ?? "Unnamed Campaign",
          expires_at: expiresAt.toISOString(),
          is_expired: now > expiresAt.getTime(),
          status: (content.status as string | undefined) ?? "unknown",
          progress: (content.progress as number | undefined) ?? 0,
          stage: content.stage as string | undefined,
          processed: content.processed as number | undefined,
          total: content.total as number | undefined,
        } satisfies SerializedExportItem;
      } catch (error) {
        logger.error(`Error processing export file ${file.name}`, error);
        return null;
      }
    }),
  );

  const exports = processedExports
    .filter((entry): entry is NonNullable<(typeof processedExports)[number]> => entry !== null)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

  return { ok: true as const, exports };
}

export async function startCampaignExportApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  campaignId: number,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const tdb = createTenantDb(workspaceId);
  const campaignRow = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: { id: true, type: true, title: true, workspace: true },
  });

  if (!campaignRow) {
    return { ok: false as const, error: "Campaign not found", status: 404 };
  }

  if (campaignRow.workspace !== workspaceId) {
    return { ok: false as const, error: "Campaign does not belong to workspace", status: 403 };
  }

  const exportId = generateCampaignExportId();

  if (campaignRow.type === "message") {
    void processMessageCampaignExport(
      supabaseClient,
      campaignId,
      workspaceId,
      exportId,
      campaignRow.title || "",
    );
  } else if (campaignRow.type === "live_call" || campaignRow.type === "robocall") {
    void processCallCampaignExport(
      supabaseClient,
      campaignId,
      workspaceId,
      exportId,
      campaignRow.title || "",
    );
  } else {
    return { ok: false as const, error: "Invalid campaign type for export", status: 400 };
  }

  return {
    ok: true as const,
    export_id: exportId,
    status: "started" as const,
    status_url: `/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`,
  };
}

export async function buildSurveyResponsesCsv(args: {
  workspaceId: string;
  surveyId: string;
}) {
  return buildSurveyResponsesCsvFromDb(args);
}

export async function exportSurveyResponsesApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  surveyId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  return buildSurveyResponsesCsv({
    workspaceId,
    surveyId,
  });
}
