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
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { AppError } from "@/lib/errors.server";
// campaign_audience is a join table without a workspace column; tdb cannot scope it.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/server/db";
import { defineLoader } from "@/lib/handler.server";

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

export const loader = defineLoader({
  auth: ({ request, params }) => requireWorkspaceLoaderContext(request, params.id),
  sideEffects: ["db-read"],
  handler: async ({ params, url, auth }) => {
    const { selected_id } = params;
    const searchParams = url.searchParams;

    const page = Number(searchParams.get("page")) || 1;
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    if (!auth.ok) return auth.response;

    const { workspaceId } = auth.ctx;
    // Absolute redirect — `../../` resolved against `/workspaces/$id/campaigns/$selected_id/queue`
    // per RFC 3986 lands on `/workspaces/$id/`, not the campaigns list.
    const campaignsListUrl = `/workspaces/${workspaceId}/campaigns`;

    if (!selected_id) throw redirect(campaignsListUrl);

    const campaignIdNum = Number(selected_id);

    // This loader must verify the campaign belongs to the workspace itself: the
    // parent layout loader's guard can be bypassed under single-fetch route
    // filtering (?_routes=), and without this the queue (contact PII) leaks
    // cross-tenant via an enumerable campaign id.
    const campaign = await findCampaignInWorkspace(workspaceId, campaignIdNum);
    if (!campaign) throw redirect(campaignsListUrl);

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
          workspaceId,
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
  },
});
