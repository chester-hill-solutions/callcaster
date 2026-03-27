import { useOutletContext } from "@remix-run/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "@/components/workspace/TeamMember";
import type { Database } from "@/lib/database.types";
import type {
  Audience,
  Campaign,
  ContextType,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Schedule,
  Script,
  Workspace,
  WorkspaceData,
  WorkspaceNumber,
  WorkspaceNumbers,
} from "@/lib/types";

export type RootOutletContext = ContextType;

/** Outlet context from `workspaces_.$id` (root env/supabase + workspace shell). */
export type WorkspaceOutletContext = ContextType & {
  workspace?: {
    id: string;
    name?: string | null;
    credits?: number | null;
    owner?: string | null;
    users?: string[] | null;
    created_at?: string;
  } | null;
  audiences: Audience[];
  campaigns: Campaign[];
  phoneNumbers: WorkspaceNumbers[];
  userRole: string | null | undefined;
};

export function useRootOutletContext(): RootOutletContext {
  return useOutletContext<RootOutletContext>();
}

export function useWorkspaceOutletContext(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}

/** Context passed from `workspaces_.$id.campaigns` into campaign child routes. */
export type CampaignRailOutletContext = {
  audiences: Audience[];
  campaigns: Campaign[];
  phoneNumbers: WorkspaceNumbers[];
  userRole: MemberRole | string | null | undefined;
  workspace: WorkspaceData;
  supabase: SupabaseClient<Database>;
};

export function useCampaignRailOutletContext(): CampaignRailOutletContext {
  return useOutletContext<CampaignRailOutletContext>();
}

export type CampaignOutletCampaignData = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

export type CampaignOutletCampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

/** Context from `workspaces_.$id.campaigns.$selected_id` into settings/queue/script.edit. */
export type CampaignSelectedOutletContext = {
  supabase: SupabaseClient<Database>;
  joinDisabled: string | null;
  audiences: Audience[];
  campaignData: CampaignOutletCampaignData;
  campaignDetails: CampaignOutletCampaignDetails;
  scheduleDisabled: string | boolean;
  phoneNumbers: WorkspaceNumbers[];
  workspace: WorkspaceData;
};

export function useCampaignSelectedOutletContext(): CampaignSelectedOutletContext {
  return useOutletContext<CampaignSelectedOutletContext>();
}

/** Context passed from `workspaces_.$id.chats` into `chats.$contact_number`. */
export type ChatsThreadOutletContext = {
  supabase: SupabaseClient<Database>;
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from: string;
        to: string;
        media?: string;
      }) => void;
    } | null,
  ) => void;
};

export function useChatsThreadOutletContext(): ChatsThreadOutletContext {
  return useOutletContext<ChatsThreadOutletContext>();
}
