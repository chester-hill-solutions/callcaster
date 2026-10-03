import {
  evaluateWorkspaceReadiness,
  type WorkspaceReadinessContext,
} from "@/lib/messaging-onboarding.server";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

export function buildA2pBlockingIssues(onboarding: WorkspaceMessagingOnboardingState) {
  const ctx: WorkspaceReadinessContext = {
    onboarding,
    workspaceNumbers: [],
  };
  const results = evaluateWorkspaceReadiness(ctx, {
    forChannel: "a2p10dlc",
    exclude: ["a2p_approved"],
    messageOverrides: {
      messaging_service_not_provisioned: "Messaging Service must be provisioned first.",
    },
  });
  return results.map((result) => result.message);
}
