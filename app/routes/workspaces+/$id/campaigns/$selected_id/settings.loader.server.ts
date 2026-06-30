import { eq } from "drizzle-orm";
import { data as routeData, redirect } from "react-router";
import { campaign as campaignTable, workspace as workspaceTable } from "@/db/schema";
import { fetchCampaignAudience, fetchCampaignDetails, getSignedUrls, getWorkspacePhoneNumbers, getWorkspaceTwilioPortalConfigFromTwilioData, getWorkspaceTwilioSyncSnapshotFromTwilioData } from "@/lib/database.server";
import { loadCampaignBillingSummary } from "@/lib/campaign-billing.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { loadActiveSurveysForWorkspace } from "@/lib/survey-db.server";
import { verifyAuth } from "@/lib/supabase.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import type { Campaign, IVRCampaign, LiveCampaign, MessageCampaign, QueueItem, TwilioAccountData } from "@/lib/types";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!selected_id || !workspace_id) return redirect("/");

  const tdb = createTenantDb(workspace_id);

  const [
    campaignWithAudience,
    campaignType,
    surveys,
    workspaceAudioList,
    workspaceTwilioResult,
    phoneNumbersResult,
    campaignCount,
    campaignStatusResult,
  ] = await Promise.all([
    fetchCampaignAudience({
      workspaceId: workspace_id,
      campaignId: selected_id,
      supabaseClient,
    }),
    tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(selected_id)),
    }),
    loadActiveSurveysForWorkspace(workspace_id),
    supabaseClient.storage.from("workspaceAudio").list(`${workspace_id}`),
    adminDb
      .select({ twilio_data: workspaceTable.twilio_data })
      .from(workspaceTable)
      .where(eq(workspaceTable.id, workspace_id))
      .limit(1),
    getWorkspacePhoneNumbers({
      workspaceId: workspace_id,
    }),
    tdb.campaign.count(),
    tdb.campaign.findFirst({
      where: eq(campaignTable.id, Number(selected_id)),
      columns: { status: true },
    }),
  ]);

  const mediaData = workspaceAudioList.data;
  let mediaLinks: string[] = [];
  const twilioData = (workspaceTwilioResult[0]?.twilio_data ?? null) as TwilioAccountData;
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
    const messageMedia = campaignType.message_media;
    if (Array.isArray(messageMedia) && messageMedia.length > 0) {
      mediaLinks = await getSignedUrls(supabaseClient, workspace_id, messageMedia);
    }
  }

  const campaignBilling = await loadCampaignBillingSummary({
    workspaceId: workspace_id,
    campaignId: Number(selected_id),
    campaignType: campaignType?.type,
    queuedCount: campaignWithAudience.queue_count ?? 0,
  }).catch((billingError) => {
    logger.error("Failed to load campaign billing summary", billingError);
    return null;
  });

  let campaignDetailsForReadiness:
    | LiveCampaign
    | MessageCampaign
    | IVRCampaign
    | null = null;
  if (campaignType?.type) {
    try {
      campaignDetailsForReadiness = (await fetchCampaignDetails({
        workspaceId: workspace_id,
        campaignId: selected_id,
      })) as LiveCampaign | MessageCampaign | IVRCampaign | null;
    } catch (detailsError) {
      logger.error("Failed to load campaign details for readiness", detailsError);
    }
  }

  const readiness = getCampaignReadiness(
    campaignType as Campaign | null | undefined,
    campaignDetailsForReadiness,
    {
      queueCount: campaignWithAudience.queue_count ?? 0,
      smsSenderClass: outboundEstimateInputs.portalConfig.smsSenderClass,
      smsMessagingServiceSendersReady:
        campaignType?.type === "message" &&
        Boolean((campaignType as Campaign | null)?.sms_send_mode === "messaging_service")
          ? messagingServiceReady
          : undefined,
    },
  );

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
    isFirstDraftCampaign:
      campaignCount === 1 &&
      campaignStatusResult?.status === "draft",
    smsSendContext: {
      messagingServiceReady,
      defaultMessagingServiceSid,
      attachedSenderPhoneNumbers:
        onboarding.messagingService.attachedSenderPhoneNumbers,
    },
    campaignBilling,
    readiness,
  });
};
