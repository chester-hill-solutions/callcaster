import { data as routeData } from "react-router";
import { and, eq, inArray } from "drizzle-orm";
import {
  deleteCampaignQueueByIds,
} from "@/lib/campaign-queue-db.server";
import { searchCampaignQueueIds } from "@/lib/campaign-queue-search.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { parseRequestData } from "@/lib/request-utils.server";
import { safeNumber } from "@/lib/type-safety-utils";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { resolveCampaignWorkspaceId } from "@/lib/platform-telephony.server";
import { contact as contactTable } from "@/db/schema";
import { AppError } from "@/lib/errors.server";
import { defineAction } from "@/lib/handler.server";
// campaign_queue is a join table without a workspace column; tdb cannot scope it.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/server/db";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";

import type { CampaignQueue } from "@/lib/types";

const BATCH_SIZE = 100;

export const action = defineAction({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
    const data = await parseRequestData(request);

    try {
      if (request.method === "POST") {
        const { ids, campaign_id, startOrder = 0, requeue = false } = data;
        const contactIds = ids.map((id: string | number) =>
          typeof id === "string" ? parseInt(id, 10) : id,
        );
        const campaignIdNum = Number(campaign_id);
        const workspaceId = await resolveCampaignWorkspaceId(campaignIdNum);
        if (!workspaceId) {
          return routeData({ error: "Campaign not found" }, { status: 404 });
        }
        await requireWorkspaceAccess({ user, workspaceId });

        const validContactIds = await db
          .select({ id: contactTable.id })
          .from(contactTable)
          .where(
            and(
              inArray(contactTable.id, contactIds),
              eq(contactTable.workspace, workspaceId),
            ),
          );
        if (validContactIds.length !== contactIds.length) {
          return routeData(
            { error: "One or more contacts do not belong to the campaign workspace" },
            { status: 400 },
          );
        }

        await enqueueContactsForCampaign(
          campaignIdNum,
          contactIds,
          { startOrder, requeue },
        );
        return routeData({ success: true });
      }

      if (request.method === "DELETE") {
        const { ids, campaign_id, filters } = data;
        const campaignIdNum = Number(campaign_id);
        const workspaceId = await resolveCampaignWorkspaceId(campaignIdNum);
        if (!workspaceId) {
          return routeData({ error: "Campaign not found" }, { status: 404 });
        }
        await requireWorkspaceAccess({ user, workspaceId });

        try {
          if (ids) {
            const results: CampaignQueue[] = [];
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
              const batch = ids
                .slice(i, i + BATCH_SIZE)
                .map((id: string | number) => (typeof id === "string" ? parseInt(id, 10) : id))
                .filter((id: number) => Number.isFinite(id));

              const deleted = await deleteCampaignQueueByIds(batch, workspaceId);
              results.push(...(deleted as CampaignQueue[]));
            }
            return routeData({ data: results });
          }

          const deleteIds = await searchCampaignQueueIds({
            campaignId: campaignIdNum,
            filters: (filters ?? {}) as QueueSearchFilters,
            workspaceId,
          });

          const validDeleteIds = deleteIds
            .map((id) => safeNumber(id))
            .filter((id) => id > 0);

          const results: CampaignQueue[] = [];
          for (let i = 0; i < validDeleteIds.length; i += BATCH_SIZE) {
            const batch = validDeleteIds.slice(i, i + BATCH_SIZE);
            const deleted = await deleteCampaignQueueByIds(batch, workspaceId);
            results.push(...(deleted as CampaignQueue[]));
          }

          return routeData({ data: results });
        } catch (error) {
          return routeData(
            { error: error instanceof Error ? error.message : "Failed to delete queue rows" },
            { status: 500 },
          );
        }
      }

      return routeData({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      if (error instanceof AppError) {
        return routeData({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    }
  },
});
