import type { Tables } from "@/lib/db-types";
import type {
  User,
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";

export type OnboardingPendingActions = {
  isSavingWorkspaceName: boolean;
  isSavingBusinessProfile: boolean;
  isSavingChannels: boolean;
  isProvisioningA2P: boolean;
  isSavingRcs: boolean;
  isAttachingRcsSender: boolean;
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
  // Structural shapes matching what the loader actually provides
  // (WorkspaceUserRow / StoredObjectMeta) and what NumbersTable consumes.
  workspaceUsers: { id: string; username: string }[];
  mediaNames: { id: number | string; name: string }[];
  inboundQueues: { id: number; name: string }[];
  scripts: { id: number; name: string }[];
};

export type OnboardingProviderActionsProps = Pick<
  OnboardingStepProps,
  "onboarding" | "rcsBlockingIssues" | "isReadOnly" | "pending"
> & {
  a2pBlockingIssues: string[];
  a2pErrors: string[];
};
