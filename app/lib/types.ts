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
export type Queue = Database["public"]["Tables"]["campaign_queue"]["Row"] | null;
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
export type CampaignQueue = Database["public"]["Tables"]["campaign_queue"]["Row"];
export type Call = Database["public"]["Tables"]["call"]["Row"] | null;
export type User = Database["public"]["Tables"]["user"]["Row"] | null;
export type WorkspaceInvite = Database["public"]["Tables"]["workspace_invite"]["Row"] | null;
export type WorkspaceTable = Audience | Campaign | Contact | null;
export type WorkspaceWebhook = Database["public"]["Tables"]["webhook"]["Row"] | null; 
export type Workspace = Database["public"]["Tables"]["workspace"]["Row"] | null;

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


  export type BlockOption = {
    next: string;
    value?: string;
    content?: string;
  };
  
  export type IVROption = {
    value: number | "vx-any";
    next: string;
    content?: string;
  }

  export type Block = {
    id: string;
    type: "radio" | "dropdown" | "boolean" | "multi" | "textarea" | "textblock" | "audio";
    title: string;
    content: string;
    options: BlockOption[] | IVROption[];
  };

  export type IVRBlock = Block & {
    audioFile: string; 
    speechType: "recorded" | "synthetic";
    responseType: "dtmf" | "speech" | "dtmf speech" | null;
  }
  
  export type Page = {
    id: string;
    title: string;
    blocks: string[];
  };
  
  export type Flow = {
    type: "ivr" | "script";
    pages: {
      [key: string]: Page;
    };
    blocks: {
      [key: string]: Block;
    };
    startPage: string; 
  };


export interface DispositionResult {
      disposition: string;
      count: number;
      average_call_duration: string;
    }
    
export interface ResultsScreenProps {
      totalCalls: number;
      results: DispositionResult[];
      expectedTotal: number;
      isBusy:boolean;
    }
    