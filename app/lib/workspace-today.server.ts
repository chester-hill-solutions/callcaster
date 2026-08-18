import { MemberRole } from "@/lib/member-role";
import { productGoalForOnboardingGoal } from "@/lib/campaign-goals";
import type { WorkspaceOnboardingGoal } from "@/lib/types";
import type { LaunchChecklistItem } from "@/lib/workspace-launch-checklist";

export type WorkspaceTodayKind =
  | "add_credits"
  | "continue_setup"
  | "get_number"
  | "create_campaign"
  | "read_messages"
  | "open_running_campaign"
  | "open_handset"
  | "review_campaigns"
  | "launch_checklist";

export type WorkspaceTodaySelection = {
  kind: WorkspaceTodayKind;
  href: string;
  unreadCount: number;
  runningCampaignTitle: string | null;
  /** Present when intake is done and the launch checklist should render. */
  launchChecklist?: LaunchChecklistItem[];
  selectedGoal?: WorkspaceOnboardingGoal | null;
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
  /** True while short intake (goal) is incomplete. */
  intakeIncomplete: boolean;
  /** True while currently_due launch items remain after intake. */
  launchChecklistIncomplete: boolean;
  hasWorkspaceNumber: boolean;
  campaigns: WorkspaceTodayCampaign[];
  unreadCount: number;
  selectedGoal?: WorkspaceOnboardingGoal | null;
  audienceCount?: number;
  scriptCount?: number;
  launchChecklist?: LaunchChecklistItem[];
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
  extras: Partial<WorkspaceTodaySelection> = {},
): WorkspaceTodaySelection {
  return {
    kind,
    href,
    unreadCount: Math.max(0, input.unreadCount),
    runningCampaignTitle,
    ...extras,
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

  // Core business+goal missing, or path wizard still incomplete → back to wizard.
  if (canAdminister && (input.intakeIncomplete || input.launchChecklistIncomplete)) {
    return selection("continue_setup", `${baseUrl}/onboarding`, input, null, {
      launchChecklist: input.launchChecklist,
      selectedGoal: input.selectedGoal ?? null,
    });
  }

  if (canAdminister && !input.hasWorkspaceNumber) {
    return selection(
      "get_number",
      `${baseUrl}/settings/numbers`,
      input,
    );
  }

  if (canAdminister && input.campaigns.length === 0) {
    const goal = input.selectedGoal;
    const productGoal = goal != null ? productGoalForOnboardingGoal(goal) : null;
    const href =
      productGoal != null
        ? `${baseUrl}/campaigns/new?goal=${encodeURIComponent(productGoal)}`
        : `${baseUrl}/campaigns/new`;
    return selection("create_campaign", href, input);
  }

  if (input.unreadCount > 0) {
    return selection("read_messages", `${baseUrl}/chats`, input);
  }

  const runningCampaign = [...input.campaigns]
    .filter(
      (campaign) =>
        campaign.type === "live_call" && (campaign.status === "running" || campaign.status === "waiting"),
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

/** @deprecated Prefer intakeIncomplete / launchChecklistIncomplete. */
export type { SelectWorkspaceTodayInput as WorkspaceTodayInput };
