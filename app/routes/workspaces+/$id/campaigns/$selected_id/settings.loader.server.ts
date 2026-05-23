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
import { data as routeData, redirect } from "react-router";
import { deepEqual } from "@/lib/utils";
import { fetchCampaignAudience, fetchQueueCounts, getCampaignTableKey, getSignedUrls, getWorkspacePhoneNumbers, getWorkspaceTwilioPortalConfigFromTwilioData, getWorkspaceTwilioSyncSnapshotFromTwilioData, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import type { LoaderFunctionArgs } from "react-router";

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
