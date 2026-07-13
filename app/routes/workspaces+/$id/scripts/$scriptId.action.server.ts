import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import {
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const formData = await request.formData();
    const campaignIdRaw = formData.get("campaignId");
    const mediaName = formData.get("fileName") as string;
    const encodedMediaName = encodeURI(mediaName);

    const { headers, workspaceId } = auth;

    if (!workspaceId) {
      return routeData({ success: false, error: "Missing workspace" }, { headers });
    }

    const campaignId = Number(campaignIdRaw);
    if (!campaignId) {
      return routeData({ success: false, error: "Missing campaignId" }, { headers });
    }

    try {
      const campaign = await findCampaignMessageMedia(workspaceId, campaignId);
      if (!campaign) {
        return routeData({ success: false, error: "Campaign not found" }, { headers });
      }

      const nextMedia = campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ) ?? [];

      await updateCampaignMessageMedia(workspaceId, campaignId, nextMedia);
    } catch (error) {
      logger.error("Campaign update error", error);
      return routeData({ success: false, error }, { headers });
    }

    return routeData({ success: true }, { headers });
  },
});
