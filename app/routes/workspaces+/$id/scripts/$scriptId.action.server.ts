import { data as routeData } from "react-router";
import {
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const campaignIdRaw = formData.get("campaignId");
  const mediaName = formData.get("fileName") as string;
  const encodedMediaName = encodeURI(mediaName);

  const workspaceId = params.id;
  const { headers } = await verifyAuth(request);

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
};
