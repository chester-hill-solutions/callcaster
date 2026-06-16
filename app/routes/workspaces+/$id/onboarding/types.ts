import type { Tables } from "@/lib/database.types";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";

export type OnboardingPendingActions = {
  isSavingBusinessProfile: boolean;
  isSavingChannels: boolean;
  isBootstrappingMessagingService: boolean;
  isProvisioningA2P: boolean;
  isSavingRcs: boolean;
  isReviewingEmergencyVoice: boolean;
  isVerifyingCallerId: boolean;
};

export type OnboardingStepProps = {
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  workspaceId: string;
  workspaceName: string;
  phoneNumbers: Tables<"workspace_number">[] | null;
  rcsBlockingIssues: string[];
  isReadOnly: boolean;
  pending: OnboardingPendingActions;
};

export type OnboardingProviderActionsProps = Pick<
  OnboardingStepProps,
  "onboarding" | "rcsBlockingIssues" | "isReadOnly" | "pending"
> & {
  a2pBlockingIssues: string[];
  a2pErrors: string[];
};
