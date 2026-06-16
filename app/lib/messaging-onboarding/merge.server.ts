import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import {
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  normalizeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding/normalize.server";

export function mergeUniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)),
  );
}

export function mergeWorkspaceMessagingOnboardingState(
  currentState: WorkspaceMessagingOnboardingState,
  updates: Partial<WorkspaceMessagingOnboardingState>,
): WorkspaceMessagingOnboardingState {
  return normalizeWorkspaceMessagingOnboardingState({
    ...currentState,
    ...updates,
    businessProfile: {
      ...currentState.businessProfile,
      ...(updates.businessProfile ?? {}),
    },
    messagingService: {
      ...currentState.messagingService,
      ...(updates.messagingService ?? {}),
      attachedSenderPhoneNumbers:
        updates.messagingService?.attachedSenderPhoneNumbers ??
        currentState.messagingService.attachedSenderPhoneNumbers,
      supportedChannels:
        updates.messagingService?.supportedChannels ??
        currentState.messagingService.supportedChannels,
    },
    subaccountBootstrap: {
      ...currentState.subaccountBootstrap,
      ...(updates.subaccountBootstrap ?? {}),
      createdResources:
        updates.subaccountBootstrap?.createdResources ??
        currentState.subaccountBootstrap.createdResources,
      featureFlags:
        updates.subaccountBootstrap?.featureFlags ??
        currentState.subaccountBootstrap.featureFlags,
      driftMessages:
        updates.subaccountBootstrap?.driftMessages ??
        currentState.subaccountBootstrap.driftMessages,
    },
    emergencyVoice: {
      ...currentState.emergencyVoice,
      ...(updates.emergencyVoice ?? {}),
      emergencyEligiblePhoneNumbers:
        updates.emergencyVoice?.emergencyEligiblePhoneNumbers ??
        currentState.emergencyVoice.emergencyEligiblePhoneNumbers,
      ineligibleCallerIds:
        updates.emergencyVoice?.ineligibleCallerIds ??
        currentState.emergencyVoice.ineligibleCallerIds,
      allowedCallerIdTypes:
        updates.emergencyVoice?.allowedCallerIdTypes ??
        currentState.emergencyVoice.allowedCallerIdTypes,
      address: {
        ...currentState.emergencyVoice.address,
        ...(updates.emergencyVoice?.address ?? {}),
      },
    },
    a2p10dlc: {
      ...currentState.a2p10dlc,
      ...(updates.a2p10dlc ?? {}),
    },
    rcs: {
      ...currentState.rcs,
      ...(updates.rcs ?? {}),
    },
    reviewState: {
      ...currentState.reviewState,
      ...(updates.reviewState ?? {}),
      blockingIssues:
        updates.reviewState?.blockingIssues ??
        currentState.reviewState.blockingIssues,
    },
    selectedChannels:
      updates.selectedChannels ?? currentState.selectedChannels,
    steps: updates.steps ?? currentState.steps,
  });
}

export function updateMessagingServiceSenders(
  onboarding: WorkspaceMessagingOnboardingState,
  phoneNumber: string,
) {
  return mergeWorkspaceMessagingOnboardingState(onboarding, {
    messagingService: {
      ...onboarding.messagingService,
      attachedSenderPhoneNumbers: mergeUniqueStrings([
        ...onboarding.messagingService.attachedSenderPhoneNumbers,
        phoneNumber,
      ]),
    },
  });
}

export { DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE };
