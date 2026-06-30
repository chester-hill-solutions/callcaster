import { data as routeData } from "react-router";
import {
  findCampaignMessageMedia,
  updateCampaignMessageMedia,
} from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const campaignId = params.selected_id;
  const workspaceId = params.id;
  if (!campaignId || !workspaceId) {
    throw new Response("Campaign ID is required", { status: 400 });
  }

  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = mediaName ? encodeURI(mediaName.toString()) : null;

  if (!encodedMediaName) {
    return routeData({ success: false, error: "File name is required" });
  }

  const { headers } = await verifyAuth(request);

  const campaign = await findCampaignMessageMedia(workspaceId, parseInt(campaignId, 10));

  if (!campaign) {
    logger.error("Campaign Error", new Error("Campaign not found"));
    return routeData({ success: false, error: "Campaign not found" }, { headers });
  }

  const campaignUpdate = await updateCampaignMessageMedia(
    workspaceId,
    parseInt(campaignId, 10),
    campaign.message_media?.filter((med) => med !== encodedMediaName) || [],
  );

  if (!campaignUpdate) {
    return routeData({ success: false, error: "Campaign update failed" }, { headers });
  }
  return routeData({ success: true, data: [campaignUpdate] }, { headers });
}
