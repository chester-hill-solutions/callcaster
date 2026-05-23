import { data as routeData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "react-router";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  Audience,
  Campaign,
  Script,
  WorkspaceNumbers,
  Schedule,
  WorkspaceData,
  QueueItem,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Survey,
  TwilioAccountData,
} from "@/lib/types";
import { deepEqual } from "@/lib/utils";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { fetchCampaignAudience, fetchQueueCounts, getCampaignTableKey, getSignedUrls, getWorkspacePhoneNumbers, getWorkspaceTwilioPortalConfigFromTwilioData, getWorkspaceTwilioSyncSnapshotFromTwilioData, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";

type CampaignStatus = "pending" | "scheduled" | "running" | "complete" | "paused" | "draft" | "archived";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

type Context = {
  supabase: SupabaseClient;
  joinDisabled: string | null;
  audiences: Audience[];
  campaignData: CampaignWithAudiences;
  campaignDetails: CampaignDetails;
  scheduleDisabled: string | boolean;
  phoneNumbers: WorkspaceNumbers[];
  workspace: WorkspaceData; 
};

type ActionData = {
  success?: boolean;
  error?: string;
  campaign?: CampaignWithAudiences;
  campaignDetails?: CampaignDetails;
  actionType?: "save" | "status" | "duplicate";
};

const DETAIL_FIELDS = new Set(["script_id", "body_text", "message_media", "voicedrop_audio"]);

function normalizeSchedule(schedule: unknown) {
  if (!schedule) return null;

  if (typeof schedule === "string") {
    try {
      return JSON.parse(schedule);
    } catch {
      return null;
    }
  }

  return schedule;
}

function normalizeCampaignData(campaignData: CampaignWithAudiences): CampaignWithAudiences {
  return {
    ...campaignData,
    schedule: normalizeSchedule(campaignData.schedule) as Schedule | null,
  } as CampaignWithAudiences;
}

function buildCampaignDetailsForType(
  campaignType: Campaign["type"],
  currentDetails: CampaignDetails,
  campaignId: number,
  workspaceId: string,
): CampaignDetails {
  const sharedFields = {
    campaign_id: campaignId,
    workspace: workspaceId,
  };

  if (campaignType === "message") {
    return {
      ...sharedFields,
      body_text: "body_text" in currentDetails ? currentDetails.body_text ?? "" : "",
      message_media: "message_media" in currentDetails ? currentDetails.message_media ?? [] : [],
    } as CampaignDetails;
  }

  if (campaignType === "robocall" || campaignType === "simple_ivr" || campaignType === "complex_ivr") {
    return {
      ...sharedFields,
      script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    } as CampaignDetails;
  }

  return {
    ...sharedFields,
    disposition_options: "disposition_options" in currentDetails ? currentDetails.disposition_options : [],
    questions: "questions" in currentDetails ? currentDetails.questions : [],
    script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    voicedrop_audio: "voicedrop_audio" in currentDetails ? currentDetails.voicedrop_audio ?? null : null,
  } as CampaignDetails;
}

async function updateCampaignStatus(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspaceId: string,
  status: string,
  is_active?: boolean
) {
  const update: { status: string; is_active?: boolean } = { status };

  // Use is_active from client if provided, otherwise determine based on status
  if (is_active !== undefined) {
    update.is_active = is_active;
  } else {
    if (status === "running") update.is_active = true;
    if (status === "paused") update.is_active = false;
  }

  logger.debug("Server update object:", update);
  const { error } = await supabaseClient
    .from("campaign")
    .update({ ...update })
    .eq("id", Number(selected_id))
    .eq("workspace", workspaceId);

  if (error) throw error;
  return { success: true };
}

async function handleCampaignDuplicate(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspace_id: string,
  campaignData: string
) {
  const parsedData = JSON.parse(campaignData);

  // Create new campaign
  const { data: campaign, error } = await supabaseClient
    .from("campaign")
    .insert({ ...parsedData, workspace: workspace_id })
    .select('id')
    .single();

  if (error || !campaign) throw error || new Error("Failed to create campaign");

  // Clone queue if it exists
  const { data: originalQueue } = await supabaseClient
    .from("campaign_queue")
    .select('contact_id')
    .eq('campaign_id', selected_id);

  if (originalQueue?.length) {
    const newQueueItems = originalQueue.map(item => ({
      campaign_id: campaign.id,
      contact_id: item.contact_id,
      workspace: workspace_id
    }));

    const { error: queueError } = await supabaseClient
      .from("campaign_queue")
      .insert(newQueueItems);

    if (queueError) throw queueError;
  }

  // Clone campaign details
  await supabaseClient
    .from(parsedData.type === 'live_call' ? 'live_campaign' :
      parsedData.type === 'message' ? 'message_campaign' : 'ivr_campaign')
    .insert({
      campaign_id: campaign.id,
      workspace: workspace_id,
      script_id: parsedData.script_id,
      body_text: parsedData.body_text,
      message_media: parsedData.message_media,
      voicedrop_audio: parsedData.voicedrop_audio
    });

  return { success: true };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {




  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  const [
    campaignWithAudience,
    campaignTypeResult,
    surveysResult,
    workspaceAudioList,
    workspaceTwilioResult,
    phoneNumbersResult,
  ] = await Promise.all([
    fetchCampaignAudience(supabaseClient, selected_id, workspace_id),
    supabaseClient
      .from("campaign")
      .select("type")
      .eq("id", Number(selected_id))
      .eq("workspace", workspace_id)
      .single(),
    supabaseClient
      .from("survey")
      .select("survey_id, title")
      .eq("workspace", workspace_id)
      .eq("is_active", true),
    supabaseClient.storage.from("workspaceAudio").list(`${workspace_id}`),
    supabaseClient
      .from("workspace")
      .select("twilio_data")
      .eq("id", workspace_id)
      .maybeSingle(),
    getWorkspacePhoneNumbers({
      supabaseClient,
      workspaceId: workspace_id,
    }),
  ]);

  const campaignType = campaignTypeResult.data;
  const surveys = surveysResult.data;
  const mediaData = workspaceAudioList.data;
  let mediaLinks: string[] = [];
  const twilioData = (workspaceTwilioResult.data?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const portalConfig = getWorkspaceTwilioPortalConfigFromTwilioData(twilioData);
  const defaultMessagingServiceSid = portalConfig.messagingServiceSid?.trim() ?? null;
  const messagingServiceReady = workspaceMessagingServiceHasAvailableSenders({
    messagingServiceSid: defaultMessagingServiceSid,
    attachedSenderPhoneNumbers: onboarding.messagingService.attachedSenderPhoneNumbers,
    workspaceNumbers: phoneNumbersResult.data ?? [],
  });
  const outboundEstimateInputs = {
    portalConfig,
    syncSnapshot: getWorkspaceTwilioSyncSnapshotFromTwilioData(twilioData),
  };

  if (campaignType?.type === "message") {
    const { data: messageCampaign } = await supabaseClient
      .from("message_campaign")
      .select("message_media")
      .eq("campaign_id", Number(selected_id))
      .eq("workspace", workspace_id)
      .maybeSingle();

    if (Array.isArray(messageCampaign?.message_media) && messageCampaign.message_media.length > 0) {
      mediaLinks = await getSignedUrls(supabaseClient, workspace_id, messageCampaign.message_media);
    }
  }

  return routeData({
    workspace_id,
    selected_id,
    campaignQueue: campaignWithAudience.campaign_queue as QueueItem[],
    queueCount: campaignWithAudience.queue_count,
    dequeuedCount: campaignWithAudience.dequeued_count,
    totalCount: campaignWithAudience.total_count,
    scripts: campaignWithAudience.scripts.filter((s): s is NonNullable<typeof s> => s !== null),
    mediaData: mediaData?.filter((media) => !media.name.startsWith("voicemail-")),
    user: user,
    mediaLinks,
    surveys,
    outboundEstimateInputs,
    smsSendContext: {
      messagingServiceReady,
      defaultMessagingServiceSid,
      attachedSenderPhoneNumbers:
        onboarding.messagingService.attachedSenderPhoneNumbers,
    },
  });
}
