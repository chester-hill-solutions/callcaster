import type { MemberRole } from "@/components/workspace/TeamMember";
import type { Campaign, WorkspaceData, WorkspaceNumbers } from "@/lib/types";

export type WorkspaceInfoWithDetails = {
  workspace: WorkspaceData & { workspace_users: { role: MemberRole }[] };
  workspace_users: { role: MemberRole }[];
  campaigns: Campaign[];
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  audiences: unknown[];
};
