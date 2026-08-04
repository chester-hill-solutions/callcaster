import type { Tables } from "@/lib/db-types";
import type { WorkspaceAdminRow } from "@/lib/admin-workspaces";

export type WorkspaceWithCampaigns = Tables<"workspace"> & {
  campaign?: Tables<"campaign">[] | null;
};

export type CampaignWithWorkspace = Tables<"campaign"> & {
  workspace?: Tables<"workspace"> | null;
};

export type DeadLetteredJobRow = {
  id: number;
  type: string;
  workspace_id: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  dead_letter_reason: string | null;
  error_message: string | null;
  failed_at: string | null;
  created_at: string;
};

export type AdminLoaderData = {
  user: Tables<"user">;
  workspaces: WorkspaceWithCampaigns[] | null;
  users: Tables<"user">[] | null;
  workspaceUsers: Tables<"workspace_users">[] | null;
  workspaceNumbers: Tables<"workspace_number">[] | null;
  workspaceRows: WorkspaceAdminRow[];
  campaigns: CampaignWithWorkspace[];
  deadLetteredJobs: DeadLetteredJobRow[];
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
