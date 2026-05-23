import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const campaignId = params.selected_id;
  const formData = await request.formData();
  const mediaName = formData.get("fileName") as string;
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", Number(campaignId) || 0)
    .single();
  if (error) {
    logger.error("Campaign Error", error);
    return routeData({ success: false, error: error }, { headers });
  }
  const { error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("campaign_id", Number(campaignId) || 0)
    .select();

  if (updateError) {
    logger.error("Campaign update error", updateError);
    return routeData({ success: false, error: updateError }, { headers });
  }
  return routeData({ success: false, error: updateError }, { headers });
};
