export {
  WIZARD_ONBOARDING_STEP_IDS,
  isWizardOnboardingStepId,
  DEFAULT_WORKSPACE_ONBOARDING_STEPS,
  WORKSPACE_MESSAGING_ONBOARDING_VERSION,
} from "@/lib/messaging-onboarding/defaults.server";
export type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/defaults.server";

export {
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  normalizeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding/normalize.server";

export {
  mergeWorkspaceMessagingOnboardingState,
  updateMessagingServiceSenders,
} from "@/lib/messaging-onboarding/merge.server";

export {
  buildOnboardingStepsForState,
  deriveWorkspaceMessagingReadiness,
  countRentedWorkspaceNumbers,
  isVerifiedCallerIdNumber,
  countVerifiedCallerIdNumbers,
  workspaceHasFirstNumber,
  applyOnboardingStepsWithWorkspaceNumbers,
  WORKSPACE_READINESS_PREDICATES,
  BUSINESS_PROFILE_REQUIRED_FIELDS,
  evaluateWorkspaceReadiness,
  evaluateWorkspaceReadinessByIds,
  evaluateWorkspaceReadinessForChannels,
  predicatePassed,
} from "@/lib/messaging-onboarding/readiness.server";
export type {
  BuildOnboardingStepsContext,
  ReadinessResult,
  WorkspaceReadinessChannel,
  WorkspaceReadinessContext,
  WorkspaceReadinessPredicate,
  WorkspaceReadinessSenderPool,
  WorkspaceReadinessNumber,
  ReadinessResultSeverity,
  EvaluateWorkspaceReadinessOptions,
} from "@/lib/messaging-onboarding/readiness.server";

export {
  getWorkspaceMessagingOnboardingFromTwilioData,
  getWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding/persistence.server";

import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { stripDisabledRcsChannel } from "@/lib/rcs-onboarding.server";
import { mergeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/merge.server";

export function applyWorkspaceOnboardingChannelPolicy(
  onboarding: WorkspaceMessagingOnboardingState,
): WorkspaceMessagingOnboardingState {
  const selectedChannels = stripDisabledRcsChannel(onboarding.selectedChannels);
  if (
    selectedChannels.length === onboarding.selectedChannels.length &&
    selectedChannels.every((channel, index) => channel === onboarding.selectedChannels[index])
  ) {
    return onboarding;
  }

  return mergeWorkspaceMessagingOnboardingState(onboarding, { selectedChannels });
}
