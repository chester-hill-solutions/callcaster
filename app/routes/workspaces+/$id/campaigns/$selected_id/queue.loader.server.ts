import {
  countCampaignQueueRows,
  countQueuedCampaignQueueRows,
  fetchCampaignQueuePage,
  mapCampaignQueueItemForUi,
} from "@/lib/campaign-queue-search.server";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";
import { Audience, QueueItem, Contact } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { campaign_audience as campaignAudienceTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { AppError } from "@/lib/errors.server";
import type { LoaderFunctionArgs } from "react-router";
import { db } from "@/server/db";

interface QueueResponse {
  queueData: (QueueItem & { contact: Contact; audiences: Audience[] })[] | null;
  queueError: AppError | Error | null;
  totalCount: number | null;
  unfilteredCount: number | null;
  queuedCount: number | null;
  currentPage: number;
  pageSize: number;
  filters: QueueSearchFilters;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { selected_id, id: workspaceId } = params;
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const result = await requireWorkspaceLoaderContext(request, workspaceId);
  if (!result.ok) return result.response;

  if (!selected_id) throw redirect("../../");

  const campaignIdNum = Number(selected_id);

  const filters: QueueSearchFilters = {
    name: searchParams.get("name") || "",
    phone: searchParams.get("phone") || "",
    disposition: searchParams.get("disposition") || "",
    queueStatus: searchParams.get("queueStatus") || "",
    audiences: searchParams.get("audiences") || "",
    email: searchParams.get("email") || "",
    address: searchParams.get("address") || "",
  };

  try {
    const [selectedAudiences, queueResult, unfilteredCount, queuedCount] = await Promise.all([
      db
        .select({ audience_id: campaignAudienceTable.audience_id })
        .from(campaignAudienceTable)
        .where(eq(campaignAudienceTable.campaign_id, campaignIdNum)),
      fetchCampaignQueuePage({
        campaignId: campaignIdNum,
        filters,
        offset,
        limit: pageSize,
      }),
      countCampaignQueueRows(campaignIdNum),
      countQueuedCampaignQueueRows(campaignIdNum),
    ]);

    const selectedAudienceIds = selectedAudiences.map((row) => row.audience_id);
    const queueResponse: QueueResponse = {
      queueData: queueResult.items.map(
        (item) => mapCampaignQueueItemForUi(item) as unknown as QueueItem & { contact: Contact; audiences: Audience[] },
      ),
      queueError: null,
      totalCount: queueResult.totalCount,
      queuedCount,
      unfilteredCount,
      currentPage: page,
      pageSize,
      filters: { ...filters },
    };

    return routeData({
      selectedAudienceIds,
      queuePromise: queueResponse,
      campaignId: selected_id,
    });
  } catch (error) {
    const queueResponse: QueueResponse = {
      queueData: null,
      queueError: error instanceof Error ? error : new Error("Failed to load queue"),
      totalCount: null,
      queuedCount: null,
      unfilteredCount: null,
      currentPage: page,
      pageSize,
      filters: { ...filters },
    };

    return routeData({
      selectedAudienceIds: [],
      queuePromise: queueResponse,
      campaignId: selected_id,
    });
  }
};
