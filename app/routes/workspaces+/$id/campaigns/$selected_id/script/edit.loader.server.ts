import { data as routeData } from "react-router";
import { getMedia, getSignedUrls, getUserRole, getWorkspaceScripts, listMedia } from "@/lib/database.server";
import { fetchCampaignForScriptEdit } from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { Script } from "@/lib/types";
import {
  type BaseCampaignDetails,
  type CampaignType,
  getScriptRecordingFileNames,
  type ScriptEditLoaderData,
} from "./edit.types";

type LoaderData = ScriptEditLoaderData;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { id: workspace_id, selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const { supabaseClient, user } = await verifyAuth(request);
  const userRole = await getUserRole({ supabaseClient, user, workspaceId: workspace_id });
  const scripts = await getWorkspaceScripts({
    workspace: workspace_id,
    supabase: supabaseClient,
  }) || [];

  const campaignData = await fetchCampaignForScriptEdit(workspace_id, parseInt(selected_id, 10));

  if (!campaignData) {
    logger.error("Error fetching campaign data", new Error("Campaign not found"));
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

  const campaignRow = campaignData as typeof campaignData & {
    script_id: number | null;
    message_media: string[] | null;
    disposition_options: unknown;
    live_questions: unknown;
    voicedrop_audio: string | null;
    script: Script | Script[] | null;
  };

  const scriptRow = Array.isArray(campaignRow.script)
    ? campaignRow.script[0] ?? undefined
    : campaignRow.script ?? undefined;

  const baseDetails: BaseCampaignDetails = {
    campaign_id: campaignRow.id,
    created_at: campaignRow.created_at,
    id: campaignRow.id,
    script_id: campaignRow.script_id,
    workspace: campaignRow.workspace ?? workspace_id,
    script: scriptRow,
    message_media: campaignRow.message_media ?? undefined,
    disposition_options: (campaignRow.disposition_options ?? undefined) as BaseCampaignDetails["disposition_options"],
    questions: (campaignRow.live_questions ?? undefined) as BaseCampaignDetails["questions"],
    voicedrop_audio: campaignRow.voicedrop_audio,
  };

  switch (campaignData.type) {
    case "message":
      if (Array.isArray(baseDetails.message_media) && baseDetails.message_media.length > 0) {
        const mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          baseDetails.message_media
        );
        campaignDetails = {
          ...baseDetails,
          mediaLinks: mediaLinks as unknown as { [key: string]: string }[]
        };
      } else {
        campaignDetails = baseDetails;
      }
      break;

    case "live_call":
    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      campaignDetails = baseDetails;
      if (campaignDetails.script?.steps) {
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

  return routeData({
    workspace_id,
    selected_id,
    data: {
      ...campaignData,
      type: campaignData.type as CampaignType,
      campaignDetails,
    },
    mediaNames,
    userRole: userRole?.role ?? "",
    scripts,
  } satisfies LoaderData);
}
