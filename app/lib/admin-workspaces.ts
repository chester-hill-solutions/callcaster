import type { Tables } from "@/lib/database.types";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";

type WorkspaceRecord = Omit<Tables<"workspace">, "twilio_data"> & {
  twilio_data: unknown;
  campaign?: Array<Tables<"campaign"> | null> | null;
};

type UserRecord = Tables<"user">;
type WorkspaceUserRecord = Tables<"workspace_users">;
type WorkspaceNumberRecord = Tables<"workspace_number">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPortalConfigFromTwilioData(twilioData: unknown) {
  const config =
    isRecord(twilioData) && isRecord(twilioData.portalConfig)
      ? twilioData.portalConfig
      : {};
  const sendMode: WorkspaceAdminRow["sendMode"] =
    config.sendMode === "messaging_service"
      ? "messaging_service"
      : "from_number";

  return {
    sendMode,
    messagingServiceSid: parseOptionalString(config.messagingServiceSid),
  };
}

function getPortalSyncFromTwilioData(twilioData: unknown) {
  const sync =
    isRecord(twilioData) && isRecord(twilioData.portalSync)
      ? twilioData.portalSync
      : {};
  const lastSyncStatus: WorkspaceAdminRow["twilioSyncStatus"] =
    sync.lastSyncStatus === "syncing" ||
    sync.lastSyncStatus === "healthy" ||
    sync.lastSyncStatus === "error" ||
    sync.lastSyncStatus === "never_synced"
      ? sync.lastSyncStatus
      : "never_synced";

  return {
    accountStatus: parseOptionalString(sync.accountStatus),
    lastSyncedAt: parseOptionalString(sync.lastSyncedAt),
    lastSyncError: parseOptionalString(sync.lastSyncError),
    lastSyncStatus,
    numberTypes: Array.isArray(sync.numberTypes)
      ? sync.numberTypes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

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

export function deriveWorkspaceAdminRows({
  workspaces,
  users,
  workspaceUsers,
  workspaceNumbers,
}: {
  workspaces: WorkspaceRecord[];
  users: UserRecord[];
  workspaceUsers: WorkspaceUserRecord[];
  workspaceNumbers: WorkspaceNumberRecord[];
}): WorkspaceAdminRow[] {
  return workspaces.map((workspace) => {
    const members = workspaceUsers.filter(
      (workspaceUser) => workspaceUser.workspace_id === workspace.id,
    );
    const ownerMembership =
      members.find((workspaceUser) => workspaceUser.role === "owner") ?? null;
    const ownerUser = ownerMembership
      ? (users.find((user) => user.id === ownerMembership.user_id) ?? null)
      : null;
    const phoneNumbers = workspaceNumbers.filter(
      (number) => number.workspace === workspace.id,
    );
    const portalConfig = getPortalConfigFromTwilioData(workspace.twilio_data);
    const syncSnapshot = getPortalSyncFromTwilioData(workspace.twilio_data);
    const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(
      workspace.twilio_data,
    );
    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding,
      workspaceNumbers: phoneNumbers.map((number) => ({
        type: number.type,
        phone_number: number.phone_number,
        capabilities: number.capabilities,
      })),
      recentOutboundCount: 0,
    });
    const campaignCount = Array.isArray(workspace.campaign)
      ? workspace.campaign.filter(Boolean).length
      : 0;

    let opsState: WorkspaceAdminRow["opsState"] = "ready";
    if (
      syncSnapshot.lastSyncStatus === "never_synced" ||
      syncSnapshot.lastSyncStatus === "syncing"
    ) {
      opsState = "pending";
    } else if (
      syncSnapshot.lastSyncStatus === "error" ||
      (portalConfig.sendMode === "messaging_service" &&
        !portalConfig.messagingServiceSid) ||
      readiness.warnings.length > 0
    ) {
      opsState = "attention";
    }

    return {
      id: workspace.id,
      name: workspace.name,
      ownerUsername: ownerUser?.username ?? "No owner",
      ownerUserId: ownerUser?.id ?? null,
      credits: workspace.credits,
      disabled: workspace.disabled,
      campaignCount,
      memberCount: members.length,
      phoneNumberCount: phoneNumbers.length,
      createdAt: workspace.created_at,
      twilioSyncStatus: syncSnapshot.lastSyncStatus,
      twilioAccountStatus: syncSnapshot.accountStatus,
      twilioLastSyncedAt: syncSnapshot.lastSyncedAt,
      twilioLastSyncError: syncSnapshot.lastSyncError,
      twilioNumberTypes:
        syncSnapshot.numberTypes.length > 0
          ? syncSnapshot.numberTypes
          : phoneNumbers.map((number) => number.type),
      opsState:
        !readiness.legacyMode && readiness.shouldRedirectToOnboarding
          ? "pending"
          : opsState,
      sendMode:
        portalConfig.sendMode === "messaging_service" ||
        readiness.sendMode === "messaging_service"
          ? "messaging_service"
          : "from_number",
      onboardingStatus: onboarding.status,
      voiceReady: readiness.voiceReady,
      legacyMode: readiness.legacyMode,
    };
  });
}

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
