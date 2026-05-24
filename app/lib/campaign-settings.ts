import type {
  Audience,
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  Script,
} from "@/lib/types";
import { normalizeSchedule } from "@/lib/workspace-members";

export type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

export type CampaignSettingsDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

export const DETAIL_FIELDS = new Set([
  "script_id",
  "body_text",
  "message_media",
  "voicedrop_audio",
]);

export function normalizeCampaignData(
  campaignData: CampaignWithAudiences,
): CampaignWithAudiences {
  return {
    ...campaignData,
    schedule: normalizeSchedule(campaignData.schedule) as Schedule | null,
  } as CampaignWithAudiences;
}

export function buildCampaignDetailsForType(
  campaignType: Campaign["type"],
  currentDetails: CampaignSettingsDetails,
  campaignId: number,
  workspaceId: string,
): CampaignSettingsDetails {
  const sharedFields = {
    campaign_id: campaignId,
    workspace: workspaceId,
  };

  if (campaignType === "message") {
    return {
      ...sharedFields,
      body_text: "body_text" in currentDetails ? currentDetails.body_text ?? "" : "",
      message_media:
        "message_media" in currentDetails ? currentDetails.message_media ?? [] : [],
    } as CampaignSettingsDetails;
  }

  if (
    campaignType === "robocall" ||
    campaignType === "simple_ivr" ||
    campaignType === "complex_ivr"
  ) {
    return {
      ...sharedFields,
      script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    } as CampaignSettingsDetails;
  }

  return {
    ...sharedFields,
    disposition_options:
      "disposition_options" in currentDetails ? currentDetails.disposition_options : [],
    questions: "questions" in currentDetails ? currentDetails.questions : [],
    script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    voicedrop_audio:
      "voicedrop_audio" in currentDetails ? currentDetails.voicedrop_audio ?? null : null,
  } as CampaignSettingsDetails;
}
