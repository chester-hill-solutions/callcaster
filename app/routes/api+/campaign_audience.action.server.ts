import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import {
  deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds,
  getQueuedContactIdsForCampaign,
} from "@/lib/campaign-queue-db.server";
import {
  campaignAndAudienceShareWorkspace,
  deleteCampaignAudienceLink,
  findCampaignAudienceLink,
  insertCampaignAudienceLink,
  listCampaignAudienceIds,
  listContactIdsForAudience,
  listContactIdsForAudiences,
} from "@/lib/campaign-audience-db.server";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/database.server";
import { getDualAuthSupabase, requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getDualAuthSupabase(auth);
  const method = request.method;

  try {
    if (method === "POST") {
      const { audience_id, campaign_id } = await safeParseJson<{
        audience_id: string | number;
        campaign_id: string | number;
      }>(request);
      const audienceId = Number(audience_id);
      const campaignId = Number(campaign_id);
      if (!Number.isFinite(audienceId) || !Number.isFinite(campaignId)) {
        return routeData({ error: "Invalid audience_id or campaign_id" }, { status: 400, headers });
      }

      if (!(await campaignAndAudienceShareWorkspace(campaignId, audienceId))) {
        return routeData({ error: "Campaign or audience not found" }, { status: 404, headers });
      }

      const existing = await findCampaignAudienceLink(campaignId, audienceId);
      if (existing) {
        return routeData({ success: true, message: "Audience already added to campaign" }, { headers });
      }

      await insertCampaignAudienceLink(campaignId, audienceId);

      const audienceContactIds = await listContactIdsForAudience(audienceId);
      let enqueued = 0;
      let skipped = 0;
      let warning: string | undefined;

      if (audienceContactIds.length > 0) {
        const existingContactIds = new Set(
          await getQueuedContactIdsForCampaign({
            campaignId,
            contactIds: audienceContactIds,
          }),
        );
        const contactIds = audienceContactIds.filter(
          (contactId) => !existingContactIds.has(contactId),
        );
        skipped = audienceContactIds.length - contactIds.length;

        if (contactIds.length === 0) {
          return routeData(
            {
              success: true,
              audienceLinked: true,
              enqueued: 0,
              skipped,
            },
            { headers },
          );
        }

        try {
          await enqueueContactsForCampaign(supabase, campaignId, contactIds, { requeue: false });
          enqueued = contactIds.length;
        } catch (enqueueError) {
          logger.error("Audience linked but queue enqueue failed:", enqueueError);
          warning =
            "Audience was linked, but some contacts could not be added to the queue. Refresh and retry queue sync if needed.";
        }
      }

      return routeData(
        {
          success: true,
          partial: Boolean(warning),
          warning,
          audienceLinked: true,
          enqueued,
          skipped,
        },
        { headers },
      );
    }

    if (method === "DELETE") {
      const { audience_id, campaign_id } = await safeParseJson<{
        audience_id: string | number;
        campaign_id: string | number;
      }>(request);
      const audienceId = Number(audience_id);
      const campaignId = Number(campaign_id);
      if (!Number.isFinite(audienceId) || !Number.isFinite(campaignId)) {
        return routeData({ error: "Invalid audience_id or campaign_id" }, { status: 400, headers });
      }

      if (!(await campaignAndAudienceShareWorkspace(campaignId, audienceId))) {
        return routeData({ error: "Campaign or audience not found" }, { status: 404, headers });
      }

      await deleteCampaignAudienceLink(campaignId, audienceId);

      const remainingAudienceIds = (await listCampaignAudienceIds(campaignId)).filter(
        (id) => id !== audienceId,
      );

      const removedAudienceContactIds = await listContactIdsForAudience(audienceId);
      let contactsToRemove = removedAudienceContactIds;

      if (remainingAudienceIds.length > 0 && contactsToRemove.length > 0) {
        const retainedContactIds = new Set(await listContactIdsForAudiences(remainingAudienceIds));
        contactsToRemove = contactsToRemove.filter(
          (contactId) => !retainedContactIds.has(contactId),
        );
      }

      if (contactsToRemove.length > 0) {
        await deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds({
          campaignId,
          contactIds: contactsToRemove,
        });
      }

      return routeData({ success: true }, { headers });
    }

    return routeData({ error: "Method not allowed" }, { status: 405, headers });
  } catch (error: unknown) {
    logger.error("Error in campaign_audience action:", error);
    return routeData(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500, headers },
    );
  }
};
