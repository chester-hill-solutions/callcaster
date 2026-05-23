import type { LoaderFunctionArgs , ActionFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { deepEqual } from "@/lib/utils";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";
import { isObject } from "@/lib/type-utils";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getMedia, getSignedUrls, getUserRole, getWorkspaceScripts, listMedia } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

type CampaignType = "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr";

type LoaderData = {
  workspace_id: string;
  selected_id: string;
  data: {
    id: number;
    type: CampaignType;
    campaignDetails: BaseCampaignDetails;
  };
  mediaNames: string[];
  userRole: string;
  scripts: Script[];
};

type PageData = LoaderData['data'];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {



  const { id: workspace_id, selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({ supabaseClient, user, workspaceId: workspace_id });
  const scripts = await getWorkspaceScripts({
    workspace: workspace_id,
    supabase: supabaseClient,
  }) || [];

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", parseInt(selected_id))
    .single();

  if (campaignError) {
    logger.error("Error fetching campaign data", campaignError);
    throw new Response("Error fetching campaign data", { status: 500 });
  }

  if (!campaignData.type || !["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(campaignData.type)) {
    throw new Response("Invalid campaign type", { status: 400 });
  }

  let campaignDetails: BaseCampaignDetails | null = null;
  let mediaNames: string[] = [];

  const files = await listMedia(supabaseClient, workspace_id);
  if (files) {
    mediaNames = files.map(file => file.name);
  }

  switch (campaignData.type) {
    case "live_call":
      ({ data: campaignDetails } = await supabaseClient
        .from("live_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", parseInt(selected_id))
        .single());
      break;

    case "message":
      ({ data: campaignDetails } = await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", parseInt(selected_id))
        .single());
      if (campaignDetails && Array.isArray(campaignDetails.message_media) && campaignDetails.message_media.length > 0) {
        const mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          campaignDetails.message_media
        );
        campaignDetails = {
          ...campaignDetails,
          mediaLinks: mediaLinks as unknown as { [key: string]: string }[]
        };
      }
      break;

    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      ({ data: campaignDetails } = await supabaseClient
        .from("ivr_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", parseInt(selected_id))
        .single());
      if (campaignDetails?.script?.steps) {
        const fileNames = getScriptRecordingFileNames(campaignDetails.script);
        const mediaLinks = await getMedia(
          fileNames,
          supabaseClient,
          workspace_id
        ) || [];
        campaignDetails = {
          ...campaignDetails,
          mediaLinks: mediaLinks as unknown as { [key: string]: string }[]
        };
      }
      break;
  }

  if (!campaignDetails) {
    throw new Response("Campaign details not found", { status: 404 });
  }

  const typedCampaignDetails: BaseCampaignDetails = {
    campaign_id: campaignDetails.campaign_id,
    created_at: campaignDetails.created_at,
    id: campaignDetails.id,
    script_id: campaignDetails.script_id,
    workspace: campaignDetails.workspace,
    script: campaignDetails.script,
    mediaLinks: campaignDetails.mediaLinks,
    message_media: campaignDetails.message_media,
    disposition_options: campaignDetails.disposition_options ?? undefined,
    questions: campaignDetails.questions ?? undefined,
    voicedrop_audio: campaignDetails.voicedrop_audio,
  };

  return routeData({
    workspace_id,
    selected_id,
    data: {
      ...campaignData,
      type: campaignData.type as CampaignType,
      campaignDetails: typedCampaignDetails
    },
    mediaNames,
    userRole: userRole?.role ?? "",
    scripts,
  } satisfies LoaderData);
}
