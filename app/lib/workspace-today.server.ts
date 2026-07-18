import { MemberRole } from "@/lib/member-role";

export type WorkspaceTodayKind =
  | "add_credits"
  | "continue_setup"
  | "get_number"
  | "create_campaign"
  | "read_messages"
  | "open_running_campaign"
  | "open_handset"
  | "review_campaigns";

export type WorkspaceTodaySelection = {
  kind: WorkspaceTodayKind;
  href: string;
  unreadCount: number;
  runningCampaignTitle: string | null;
};

export type WorkspaceTodayCampaign = {
  id: string | number;
  status?: string | null;
  title?: string | null;
  type?: string | null;
};

export type SelectWorkspaceTodayInput = {
  workspaceId: string;
  userRole: string | null | undefined;
  credits: number;
  onboardingIncomplete: boolean;
  hasWorkspaceNumber: boolean;
  campaigns: WorkspaceTodayCampaign[];
  unreadCount: number;
};

function campaignIdCompare(
  left: WorkspaceTodayCampaign,
  right: WorkspaceTodayCampaign,
): number {
  const leftNumeric = Number(left.id);
  const rightNumeric = Number(right.id);
  if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) {
    return leftNumeric - rightNumeric;
  }
  return String(left.id).localeCompare(String(right.id));
}

function selection(
  kind: WorkspaceTodayKind,
  href: string,
  input: SelectWorkspaceTodayInput,
  runningCampaignTitle: string | null = null,
): WorkspaceTodaySelection {
  return {
    kind,
    href,
    unreadCount: Math.max(0, input.unreadCount),
    runningCampaignTitle,
  };
}

export function selectWorkspaceToday(
  input: SelectWorkspaceTodayInput,
): WorkspaceTodaySelection {
  const baseUrl = `/workspaces/${encodeURIComponent(input.workspaceId)}`;
  const canAdminister =
    input.userRole === MemberRole.Owner ||
    input.userRole === MemberRole.Admin;

  if (canAdminister && input.credits <= 0) {
    return selection("add_credits", `${baseUrl}/billing`, input);
  }

  if (canAdminister && input.onboardingIncomplete) {
    return selection("continue_setup", `${baseUrl}/onboarding`, input);
  }

  if (canAdminister && !input.hasWorkspaceNumber) {
    return selection(
      "get_number",
      `${baseUrl}/settings/numbers/purchase`,
      input,
    );
  }

  if (canAdminister && input.campaigns.length === 0) {
    return selection("create_campaign", `${baseUrl}/campaigns/new`, input);
  }

  if (input.unreadCount > 0) {
    return selection("read_messages", `${baseUrl}/chats`, input);
  }

  const runningCampaign = [...input.campaigns]
    .filter(
      (campaign) =>
        campaign.type === "live_call" && campaign.status === "running",
    )
    .sort(campaignIdCompare)[0];

  if (runningCampaign) {
    return selection(
      "open_running_campaign",
      `${baseUrl}/campaigns/${encodeURIComponent(String(runningCampaign.id))}/call`,
      input,
      runningCampaign.title?.trim() || "Live campaign",
    );
  }

  if (input.userRole === MemberRole.Caller) {
    return selection("open_handset", `${baseUrl}/handset`, input);
  }

  return selection("review_campaigns", `${baseUrl}/campaigns`, input);
}
