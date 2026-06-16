import { data as routeData } from "react-router";
import { deepEqual } from "@/lib/utils";
import { getMedia, getSignedUrls, getUserRole, getWorkspaceScripts, listMedia } from "@/lib/database.server";
import { isObject } from "@/lib/type-utils";
import { logger } from "@/lib/logger.server";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const campaignId = params.selected_id;
  if (!campaignId) {
    throw new Response("Campaign ID is required", { status: 400 });
  }

  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = mediaName ? encodeURI(mediaName.toString()) : null;

  if (!encodedMediaName) {
    return routeData({ success: false, error: "File name is required" });
  }

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", parseInt(campaignId))
    .single();

  if (error) {
    logger.error("Campaign Error", error);
    return routeData({ success: false, error: error }, { headers });
  }

  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ) || [],
    })
    .eq("campaign_id", parseInt(campaignId))
    .select();

  if (updateError) {
    return routeData({ success: false, error: updateError }, { headers });
  }
  return routeData({ success: true, data: campaignUpdate }, { headers });
}
