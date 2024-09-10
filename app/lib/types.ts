import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";


export type ENV = {
  SUPABASE_URL: string | undefined;
  SUPABASE_KEY: string | undefined;
  BASE_URL: string | undefined;
};

export type ContextType = {
  supabase: SupabaseClient;
  env: ENV;
};

export type Audience = Database["public"]["Tables"]["audience"]["Row"] | null;
export type Campaign = Database["public"]["Tables"]["campaign"]["Row"] | null;
export type Contact = Database["public"]["Tables"]["contact"]["Row"] | null;
export type Queue = Database["public"]["Tables"]["contact"]["Row"] | null;
export type Message = Database["public"]["Tables"]["message"]["Row"] | null;
export type OutreachAttempt = Database["public"]["Tables"]["outreach_attempt"]["Row"] | null;
export type ContactAudience = Database["public"]["Tables"]["contact_audience"]["Row"] | null;
export type CampaignAudience = Database["public"]["Tables"]["campaign_audience"]["Row"] | null;
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"]
export type WorkspaceNumbers = Database["public"]["Tables"]["workspace_number"]["Row"] | null;
export type LiveCampaign = Database["public"]["Tables"]["live_campaign"]["Row"] | null;
export type IVRCampaign = Database["public"]["Tables"]["ivr_campaign"]["Row"] | null;
export type MessageCampaign = Database["public"]["Tables"]["message_campaign"]["Row"] | null;
export type Script = Database["public"]["Tables"]["script"]["Row"] | null;
export type QueueItem = Queue & {contact: Contact}
export type Call = Database["public"]["Tables"]["call"] | null;

export type WorkspaceTable = Audience | Campaign | Contact | null;

export enum WorkspaceTableNames {
  Audience = "audiences",
  Campaign = "campaigns",
  Contact = "contacts",
}

export type WorkspaceData =
  | {
      created_at: string;
      id: string;
      name: string;
      owner: string | null;
      users: string[] | null;
    }[]
  | null;
