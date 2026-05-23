import type { LoaderFunctionArgs , ActionFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { deepEqual } from "@/lib/utils";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";
import { isObject } from "@/lib/type-utils";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { getMedia, getSignedUrls, getUserRole, getWorkspaceScripts, listMedia } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

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
