import type { Database } from "@/lib/db-types";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { getWorkspacePhoneNumbers } from "@/lib/database.server";
import { hydrateWorkspaceRcsOnboardingState } from "@/lib/rcs-onboarding.server";

export async function persistWorkspaceOnboardingState(args: {
  workspaceId: string;
  actorUserId: string | null;
  updates: Partial<WorkspaceMessagingOnboardingState>;
  hydrateRcs?: boolean;
}) {
  const { workspaceId, actorUserId, updates, hydrateRcs = true } = args;

  const [phoneNumbers, current] = await Promise.all([
    getWorkspacePhoneNumbers({ workspaceId }),
    getWorkspaceMessagingOnboardingState({ workspaceId }),
  ]);

  let merged = mergeWorkspaceMessagingOnboardingState(current, updates);
  if (hydrateRcs) {
    merged = hydrateWorkspaceRcsOnboardingState(merged);
  }

  const withSteps = applyOnboardingStepsWithWorkspaceNumbers(
    merged,
    phoneNumbers.data ?? [],
  );

  return updateWorkspaceMessagingOnboardingState({
    workspaceId,
    updates: withSteps,
    actorUserId,
  });
}
