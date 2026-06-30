import { data as routeData } from "react-router";
import { and, eq, inArray } from "drizzle-orm";
import {
  deleteCampaignQueueByIds,
} from "@/lib/campaign-queue-db.server";
import { searchCampaignQueueIds } from "@/lib/campaign-queue-search.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { parseRequestData } from "@/lib/database.server";
import { safeNumber } from "@/lib/type-safety-utils";
import { getDualAuthSupabase, getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { campaign_queue as campaignQueueTable } from "@/db/schema";
import { db } from "@/server/db";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";

import type { ActionFunctionArgs } from "react-router";
import type { CampaignQueue } from "@/lib/types";

const BATCH_SIZE = 100;

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const supabaseClient = getDualAuthSupabase(auth);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await parseRequestData(request);

  if (request.method === "POST") {
    const { ids, campaign_id, startOrder = 0, requeue = false } = data;
    const contactIds = ids.map((id: string | number) =>
      typeof id === "string" ? parseInt(id, 10) : id,
    );
    await enqueueContactsForCampaign(
      supabaseClient,
      Number(campaign_id),
      contactIds,
      { startOrder, requeue },
    );
    return routeData({ success: true });
  }

  if (request.method === "DELETE") {
    const { ids, campaign_id, filters } = data;
    const campaignIdNum = Number(campaign_id);

    try {
      if (ids) {
        const results: CampaignQueue[] = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids
            .slice(i, i + BATCH_SIZE)
            .map((id: string | number) => (typeof id === "string" ? parseInt(id, 10) : id))
            .filter((id: number) => Number.isFinite(id));

          const deleted = await db
            .delete(campaignQueueTable)
            .where(
              and(
                eq(campaignQueueTable.campaign_id, campaignIdNum),
                inArray(campaignQueueTable.id, batch),
              ),
            )
            .returning();

          results.push(...(deleted as CampaignQueue[]));
        }
        return routeData({ data: results });
      }

      const deleteIds = await searchCampaignQueueIds({
        campaignId: campaignIdNum,
        filters: (filters ?? {}) as QueueSearchFilters,
      });

      const validDeleteIds = deleteIds
        .map((id) => safeNumber(id))
        .filter((id) => id > 0);

      const results: CampaignQueue[] = [];
      for (let i = 0; i < validDeleteIds.length; i += BATCH_SIZE) {
        const batch = validDeleteIds.slice(i, i + BATCH_SIZE);
        const deleted = await deleteCampaignQueueByIds(batch);
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
};
