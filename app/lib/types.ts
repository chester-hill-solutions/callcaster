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
export type OutreachAttempt =
  | Database["public"]["Tables"]["outreach_attempt"]["Row"]
  | null;
export type ContactAudience =
  | Database["public"]["Tables"]["contact_audience"]["Row"]
  | null;
export type CampaignAudience =
  | Database["public"]["Tables"]["campaign_audience"]["Row"]
  | null;
export type WorkspaceNumbers =
  | Database["public"]["Tables"]["workspace_number"]["Row"]
  | null;
export type LiveCampaign =
  | Database["public"]["Tables"]["live_campaign"]["Row"]
  | null;
export type IVRCampaign =
  | Database["public"]["Tables"]["ivr_campaign"]["Row"]
  | null;
export type MessageCampaign =
  | Database["public"]["Tables"]["message_campaign"]["Row"]
  | null;
export type Script = Database["public"]["Tables"]["script"]["Row"] | null;
export type QueueItem = Queue & { contact: Contact };
export type Call = Database["public"]["Tables"]["call"]["Row"] | null;
export type User = Database["public"]["Tables"]["user"]["Row"] | null;

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

type FeatureFlag = boolean;

type NestedFlags = {
  [key: string]: FeatureFlag | NestedFlags;
};

export type Flags = {
  [key: string]: NestedFlags;
};

type ScheduleInterval = {
  start: string;
  end: string;
};

export type Schedule = {
  sunday: { active: boolean; intervals: ScheduleInterval[] };
  monday: { active: boolean; intervals: ScheduleInterval[] };
  tuesday: { active: boolean; intervals: ScheduleInterval[] };
  wednesday: { active: boolean; intervals: ScheduleInterval[] };
  thursday: { active: boolean; intervals: ScheduleInterval[] };
  friday: { active: boolean; intervals: ScheduleInterval[] };
  saturday: { active: boolean; intervals: ScheduleInterval[] };
};

export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";
