import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const campaignIdRaw = formData.get("campaignId");
  const mediaName = formData.get("fileName") as string;
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers } = await verifyAuth(request);

  const campaignId = Number(campaignIdRaw);
  if (!campaignId) {
    return routeData({ success: false, error: "Missing campaignId" }, { headers });
  }

  const { data: campaign, error } = await supabaseClient
    .from("campaign")
    .select("id, message_media")
    .eq("id", campaignId)
    .single();
  if (error) {
    logger.error("Campaign Error", error);
    return routeData({ success: false, error: error }, { headers });
  }
  const { error: updateError } = await supabaseClient
    .from("campaign")
    .update({
      message_media: campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("id", campaignId)
    .select();

  if (updateError) {
    logger.error("Campaign update error", updateError);
    return routeData({ success: false, error: updateError }, { headers });
  }
  return routeData({ success: true }, { headers });
};
