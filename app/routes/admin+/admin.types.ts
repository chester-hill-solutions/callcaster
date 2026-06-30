import type { Tables } from "@/lib/db-types";
import type { WorkspaceAdminRow } from "@/lib/admin-workspaces";

export type WorkspaceWithCampaigns = Tables<"workspace"> & {
  campaign?: Tables<"campaign">[] | null;
};

export type CampaignWithWorkspace = Tables<"campaign"> & {
  workspace?: Tables<"workspace"> | null;
};

export type AdminLoaderData = {
  user: Tables<"user">;
  workspaces: WorkspaceWithCampaigns[] | null;
  users: Tables<"user">[] | null;
  workspaceUsers: Tables<"workspace_users">[] | null;
  workspaceNumbers: Tables<"workspace_number">[] | null;
  workspaceRows: WorkspaceAdminRow[];
  campaigns: CampaignWithWorkspace[];
  stats: {
    totalWorkspaces: number;
    totalUsers: number;
    totalCampaigns: number;
    activeWorkspaces: number;
  };
};

export type AdminActionData = {
  success?: string;
  error?: string;
};
