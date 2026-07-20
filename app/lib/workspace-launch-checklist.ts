/**
 * Non-`.server.ts` module: goal-scoped launch checklist for Workspace Today.
 * Completion is derived from product state (counts, numbers, credits).
 * Links return to the path wizard (`/onboarding?step=…`) so setup stays
 * guided after business basics + goal.
 */

import { goalNeedsScript } from "@/lib/messaging-onboarding/goals";
import { workspaceHasFirstNumber } from "@/lib/messaging-onboarding/predicates";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingGoal,
} from "@/lib/types";

export type LaunchChecklistDue = "currently" | "eventually" | "warning";

export type LaunchChecklistItemId =
  | "goal"
  | "audience"
  | "phone_number"
  | "script"
  | "campaign"
  | "credits"
  | "launch_review";

export type LaunchChecklistItem = {
  id: LaunchChecklistItemId;
  label: string;
  description: string;
  complete: boolean;
  href: string;
  due: LaunchChecklistDue;
};

export type BuildLaunchChecklistInput = {
  workspaceId: string;
  onboarding: Pick<
    WorkspaceMessagingOnboardingState,
    "selectedGoal" | "status"
  >;
  audienceCount: number;
  scriptCount: number;
  campaignCount: number;
  creditsBalance: number;
  workspaceNumbers: Array<{
    type?: string | null;
    capabilities?: unknown;
  }>;
  /** First incomplete currently_due campaign id, when known. */
  draftCampaignId?: string | number | null;
};

function workspaceBase(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

function onboardingStepHref(workspaceId: string, step: string): string {
  return `${workspaceBase(workspaceId)}/onboarding?step=${encodeURIComponent(step)}`;
}

export function buildWorkspaceLaunchChecklist(
  input: BuildLaunchChecklistInput,
): LaunchChecklistItem[] {
  const goal = input.onboarding.selectedGoal;
  const hasNumber = workspaceHasFirstNumber(input.workspaceNumbers);
  const needsScript = goalNeedsScript(goal);

  const items: LaunchChecklistItem[] = [
    {
      id: "goal",
      label: "Choose a campaign goal",
      description: "Pick live calling, IVR, or SMS blast for this workspace.",
      complete: goal != null,
      href: onboardingStepHref(input.workspaceId, "path_selection"),
      due: "currently",
    },
    {
      id: "audience",
      label: "Add contacts",
      description: "Upload an audience your campaign can reach.",
      complete: input.audienceCount > 0,
      href: onboardingStepHref(input.workspaceId, "audience"),
      due: "currently",
    },
    {
      id: "phone_number",
      label: "Connect a phone number",
      description: "Rent a number or verify a caller ID before launching.",
      complete: hasNumber,
      href: onboardingStepHref(input.workspaceId, "first_number"),
      due: "currently",
    },
  ];

  if (needsScript) {
    items.push({
      id: "script",
      label: "Create a script",
      description:
        goal === "sms_blast"
          ? "Write the message content your SMS campaign will send."
          : "Build the IVR or call script your campaign will use.",
      complete: input.scriptCount > 0,
      href: onboardingStepHref(input.workspaceId, "script"),
      due: "currently",
    });
  }

  items.push(
    {
      id: "campaign",
      label: "Create a campaign",
      description: "Connect your audience, number, and content into one campaign.",
      complete: input.campaignCount > 0,
      href: onboardingStepHref(input.workspaceId, "campaign_info"),
      due: "currently",
    },
    {
      id: "credits",
      label: "Add credits",
      description: "A positive balance keeps campaigns and calls active.",
      complete: input.creditsBalance > 0,
      href: onboardingStepHref(input.workspaceId, "credits"),
      due: "warning",
    },
    {
      id: "launch_review",
      label: "Ready to launch",
      description:
        input.campaignCount > 0
          ? "Review launch checks in the setup wizard, then open your campaign."
          : "Create a campaign first, then review launch readiness.",
      complete:
        input.campaignCount > 0 &&
        input.audienceCount > 0 &&
        hasNumber &&
        (!needsScript || input.scriptCount > 0),
      href: onboardingStepHref(input.workspaceId, "launch_checks"),
      due: "currently",
    },
  );

  return items;
}

export function launchChecklistProgress(items: LaunchChecklistItem[]): {
  completeCount: number;
  requiredCount: number;
  hasIncompleteCurrentlyDue: boolean;
  nextItem: LaunchChecklistItem | null;
} {
  const required = items.filter((item) => item.due === "currently");
  const completeCount = required.filter((item) => item.complete).length;
  const nextItem = required.find((item) => !item.complete) ?? null;
  return {
    completeCount,
    requiredCount: required.length,
    hasIncompleteCurrentlyDue: nextItem != null,
    nextItem,
  };
}

/** Primary CTA after core setup: next incomplete wizard step. */
export function launchChecklistPrimaryHref(
  items: LaunchChecklistItem[],
  workspaceId: string,
  _goal: WorkspaceOnboardingGoal | null,
): string {
  const next = launchChecklistProgress(items).nextItem;
  if (next) return next.href;
  const launch = items.find((item) => item.id === "launch_review");
  if (launch) return launch.href;
  return onboardingStepHref(workspaceId, "launch_checks");
}
