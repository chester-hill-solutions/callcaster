import type {
  Audience,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
} from "@/lib/types";

export type CampaignState = {
  campaign_id: string;
  workspace: string;
  title: string;
  status: string;
  type:
    | "message"
    | "robocall"
    | "live_call"
    | "simple_ivr"
    | "complex_ivr"
    | "email";
  phase: "identification" | "persuasion" | "gotv";
  dial_type: "call" | "predictive" | null;
  group_household_queue: boolean;
  start_date: string;
  end_date: string;
  caller_id: string | null;
  voicemail_file: string | null;
  script_id: number | null;
  audiences: NonNullable<Audience>[];
  body_text: string | null;
  message_media: string[] | null;
  voicedrop_audio: string | null;
  schedule: Schedule | null;
  is_active: boolean;
  details: LiveCampaign | MessageCampaign | IVRCampaign;
};
