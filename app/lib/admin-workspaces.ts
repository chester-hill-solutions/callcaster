export type WorkspaceSortKey =
  | "name"
  | "created_at"
  | "credits"
  | "campaign_count"
  | "member_count"
  | "phone_number_count";

export type WorkspaceAdminRow = {
  id: string;
  name: string;
  ownerUsername: string;
  ownerUserId: string | null;
  credits: number;
  disabled: boolean;
  campaignCount: number;
  memberCount: number;
  phoneNumberCount: number;
  createdAt: string;
  twilioSyncStatus: "never_synced" | "syncing" | "healthy" | "error";
  twilioAccountStatus: string | null;
  twilioLastSyncedAt: string | null;
  twilioLastSyncError: string | null;
  twilioNumberTypes: string[];
  opsState: "ready" | "attention" | "pending";
  sendMode: "from_number" | "messaging_service";
  onboardingStatus: string;
  voiceReady: boolean;
  legacyMode: boolean;
};

export function filterWorkspaceAdminRows(
  rows: WorkspaceAdminRow[],
  filters: {
    search: string;
    status: "all" | "active" | "disabled";
    owner: string;
    opsState: "all" | WorkspaceAdminRow["opsState"];
  },
): WorkspaceAdminRow[] {
  const search = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch =
      search.length === 0 ||
      row.name.toLowerCase().includes(search) ||
      row.id.toLowerCase().includes(search) ||
      row.ownerUsername.toLowerCase().includes(search);
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "active" && !row.disabled) ||
      (filters.status === "disabled" && row.disabled);
    const matchesOwner =
      filters.owner === "all" || row.ownerUserId === filters.owner;
    const matchesOpsState =
      filters.opsState === "all" || row.opsState === filters.opsState;

    return matchesSearch && matchesStatus && matchesOwner && matchesOpsState;
  });
}

export function sortWorkspaceAdminRows(
  rows: WorkspaceAdminRow[],
  sortKey: WorkspaceSortKey,
  sortDirection: "asc" | "desc",
): WorkspaceAdminRow[] {
  const sorted = [...rows].sort((left, right) => {
    switch (sortKey) {
      case "name":
        return left.name.localeCompare(right.name);
      case "created_at":
        return left.createdAt.localeCompare(right.createdAt);
      case "credits":
        return left.credits - right.credits;
      case "campaign_count":
        return left.campaignCount - right.campaignCount;
      case "member_count":
        return left.memberCount - right.memberCount;
      case "phone_number_count":
        return left.phoneNumberCount - right.phoneNumberCount;
    }
  });

  return sortDirection === "asc" ? sorted : sorted.reverse();
}
