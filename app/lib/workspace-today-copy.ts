import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";
import { launchChecklistProgress } from "@/lib/workspace-launch-checklist";

export type WorkspaceTodayCopy = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
};

function unreadDescription(count: number): string {
  return count === 1
    ? "One message is ready for your reply."
    : `${count} messages are ready for your replies.`;
}

export function getWorkspaceTodayCopy(
  today: WorkspaceTodaySelection,
): WorkspaceTodayCopy {
  switch (today.kind) {
    case "add_credits":
      return {
        eyebrow: "Account balance",
        title: "Add credits to resume activity",
        description:
          "A positive credit balance keeps campaigns and calls active.",
        actionLabel: "Add credits",
      };
    case "continue_setup":
      return {
        eyebrow: "Workspace setup",
        title: "Continue workspace setup",
        description:
          "Finish business details and the guided steps for your campaign path.",
        actionLabel: "Continue setup",
      };
    case "launch_checklist": {
      const progress = today.launchChecklist
        ? launchChecklistProgress(today.launchChecklist)
        : null;
      return {
        eyebrow: "Launch checklist",
        title: "Get ready to launch your first campaign",
        description: progress
          ? `${progress.completeCount} of ${progress.requiredCount} launch steps complete. Open the next item to keep going.`
          : "Complete the checklist below to prepare your first campaign.",
        actionLabel: "Continue setup",
      };
    }
    case "get_number":
      return {
        eyebrow: "Phone setup",
        title: "Connect a workspace number",
        description:
          "A rented or verified number prepares the workspace for campaigns.",
        actionLabel: "Get a number",
      };
    case "create_campaign":
      return {
        eyebrow: "Campaign setup",
        title: "Create your first campaign",
        description:
          "Build a campaign to organize contacts, content, and launch settings.",
        actionLabel: "Create campaign",
      };
    case "read_messages":
      return {
        eyebrow: "Conversations",
        title: "Reply to new messages",
        description: unreadDescription(today.unreadCount),
        actionLabel: "Open messages",
      };
    case "open_running_campaign":
      return {
        eyebrow: "Live campaign",
        title: today.runningCampaignTitle ?? "Open live campaign",
        description: "Continue calling contacts in this live campaign.",
        actionLabel: "Open dial session",
      };
    case "open_handset":
      return {
        eyebrow: "Calling",
        title: "Open your handset",
        description: "Start calling from the workspace handset.",
        actionLabel: "Open handset",
      };
    case "review_campaigns":
      return {
        eyebrow: "Campaigns",
        title: "Review workspace campaigns",
        description: "See campaign status and choose the next item to work on.",
        actionLabel: "Review campaigns",
      };
    default: {
      const exhaustive: never = today.kind;
      return exhaustive;
    }
  }
}
