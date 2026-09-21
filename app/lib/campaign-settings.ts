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
    type: normalizeIvrCampaignType(campaignData.type),
    schedule: normalizeSchedule(campaignData.schedule) as Schedule | null,
    sms_send_window: normalizeSchedule(
      (campaignData as CampaignWithAudiences & { sms_send_window?: unknown })
        .sms_send_window,
    ),
  } as CampaignWithAudiences;
}

/**
 * IVR is a single campaign type. A `simple_ivr` / `complex_ivr` row
 * saved before the split was removed reads and persists as `robocall`.
 */
export function normalizeIvrCampaignType<
  T extends string | null | undefined,
>(type: T): T | "robocall" {
  return type === "simple_ivr" || type === "complex_ivr" ? "robocall" : type;
}

export function buildCampaignDetailsForType(
  campaignType: Campaign["type"],
  currentDetails: CampaignSettingsDetails,
  campaignId: number,
  workspaceId: string,
): CampaignSettingsDetails {
  const sharedFields = {
    ...currentDetails,
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
