import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOnboardingStepState,
} from "@/lib/types";
import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding.server";
import { DEFAULT_WORKSPACE_ONBOARDING_STEPS } from "@/lib/messaging-onboarding/defaults.server";

export type BuildOnboardingStepsContext = {
  hasFirstNumber?: boolean;
};

export function buildOnboardingStepsForState(
  onboarding: WorkspaceMessagingOnboardingState,
  context: BuildOnboardingStepsContext = {},
): WorkspaceOnboardingStepState[] {
  const hasFirstNumber = context.hasFirstNumber ?? false;
  const stepById = Object.fromEntries(
    DEFAULT_WORKSPACE_ONBOARDING_STEPS.map((step) => [step.id, step]),
  ) as Record<string, WorkspaceOnboardingStepState>;
  const businessProfileStep = stepById.business_profile!;
  const useCaseStep = stepById.use_case!;
  const pathSelectionStep = stepById.path_selection!;
  const messagingServiceStep = stepById.messaging_service!;
  const firstNumberStep = stepById.first_number!;
  const providerProvisioningStep = stepById.provider_provisioning!;
  const launchChecksStep = stepById.launch_checks!;
  const businessBasicsComplete = Boolean(
    onboarding.businessProfile.legalBusinessName &&
      onboarding.businessProfile.websiteUrl &&
      onboarding.businessProfile.useCaseSummary &&
      onboarding.businessProfile.sampleMessages.length > 0,
  );
  const emergencyReady =
    onboarding.emergencyVoice.address.status === "validated" &&
    onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0;
  const providerReady =
    (!onboarding.selectedChannels.includes("a2p10dlc") ||
      onboarding.a2p10dlc.status === "approved" ||
      onboarding.a2p10dlc.status === "live") &&
    (!isRcsOnboardingEnabled() ||
      !onboarding.selectedChannels.includes("rcs") ||
      onboarding.rcs.status === "approved" ||
      onboarding.rcs.status === "live" ||
      onboarding.rcs.status === "in_review");
  const hasFirstNumberComplete = hasFirstNumber;

  return [
    {
      ...businessProfileStep,
      status: businessBasicsComplete ? "complete" : "in_progress",
    },
    {
      ...useCaseStep,
      status: businessBasicsComplete ? "complete" : "in_progress",
    },
    {
      ...pathSelectionStep,
      status: onboarding.selectedChannels.length > 0 ? "complete" : "in_progress",
    },
    {
      ...messagingServiceStep,
      status: onboarding.messagingService.serviceSid ? "complete" : "in_progress",
    },
    {
      ...firstNumberStep,
      status: hasFirstNumberComplete ? "complete" : "in_progress",
    },
    {
      ...providerProvisioningStep,
      status: providerReady ? "complete" : "in_progress",
    },
    {
      ...launchChecksStep,
      status:
        onboarding.messagingService.serviceSid &&
        hasFirstNumberComplete &&
        providerReady &&
        (!onboarding.selectedChannels.includes("voice_compliance") || emergencyReady)
          ? "complete"
          : "pending",
    },
  ];
}

export function countRentedWorkspaceNumbers(
  workspaceNumbers: Array<{ type?: string | null }>,
): number {
  return workspaceNumbers.filter((number) => number.type === "rented").length;
}

export function isVerifiedCallerIdNumber(number: {
  type?: string | null;
  capabilities?: unknown;
}): boolean {
  if (number.type !== "caller_id") {
    return false;
  }
  if (
    !number.capabilities ||
    typeof number.capabilities !== "object" ||
    Array.isArray(number.capabilities)
  ) {
    return false;
  }
  return (
    (number.capabilities as Record<string, unknown>).verification_status === "success"
  );
}

export function countVerifiedCallerIdNumbers(
  workspaceNumbers: Array<{
    type?: string | null;
    capabilities?: unknown;
  }>,
): number {
  return workspaceNumbers.filter(isVerifiedCallerIdNumber).length;
}

export function workspaceHasFirstNumber(
  workspaceNumbers: Array<{
    type?: string | null;
    capabilities?: unknown;
  }>,
): boolean {
  return (
    countRentedWorkspaceNumbers(workspaceNumbers) > 0 ||
    countVerifiedCallerIdNumbers(workspaceNumbers) > 0
  );
}

export function deriveWorkspaceMessagingReadiness({
  onboarding,
  workspaceNumbers,
  recentOutboundCount,
}: {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceNumbers: Array<{
    phone_number?: string | null;
    type?: string | null;
    capabilities?: unknown;
  }>;
  recentOutboundCount: number;
}): WorkspaceMessagingReadiness {
  const numbers = workspaceNumbers.filter(Boolean);
  const rentedNumbers = numbers.filter((number) => number.type === "rented");
  const callerIds = numbers.filter((number) => number.type === "caller_id");
  const hasLegacyTraffic = recentOutboundCount > 0 || numbers.length > 0;
  const messagingReady = Boolean(onboarding.messagingService.serviceSid);
  const hasValidatedEmergencyAddress =
    onboarding.emergencyVoice.address.status === "validated";
  const businessCountryCode = onboarding.emergencyVoice.address.countryCode.trim().toUpperCase();
  const isCanadianBusiness = businessCountryCode === "CA" || businessCountryCode === "CANADA";
  const voiceReady =
    !onboarding.selectedChannels.includes("voice_compliance") ||
    (onboarding.emergencyVoice.enabled &&
      hasValidatedEmergencyAddress &&
      onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0);

  const warnings: string[] = [];
  if (!messagingReady) {
    warnings.push("Messaging Service has not been provisioned yet.");
  }
  if (
    onboarding.selectedChannels.includes("a2p10dlc") &&
    !isCanadianBusiness &&
    onboarding.a2p10dlc.status !== "approved" &&
    onboarding.a2p10dlc.status !== "live"
  ) {
    warnings.push("A2P 10DLC registration is not approved yet.");
  }
  if (
    onboarding.selectedChannels.includes("voice_compliance") &&
    !voiceReady
  ) {
    warnings.push("Emergency voice readiness is incomplete.");
  }
  if (callerIds.length > 0 && rentedNumbers.length === 0) {
    warnings.push(
      "Only verified caller IDs are present. Outbound is supported, but inbound SMS and calls require a rented number.",
    );
  }
  if (!workspaceHasFirstNumber(numbers)) {
    warnings.push("No phone number yet.");
  }

  const shouldRedirectToOnboarding = !hasLegacyTraffic && warnings.length > 0;

  return {
    shouldRedirectToOnboarding,
    shouldShowOnboardingBanner: warnings.length > 0,
    messagingReady,
    voiceReady,
    legacyMode: hasLegacyTraffic,
    sendMode:
      messagingReady &&
      onboarding.messagingService.desiredSendMode === "messaging_service"
        ? "messaging_service"
        : "from_number",
    messagingServiceSid: onboarding.messagingService.serviceSid,
    selectedChannels: onboarding.selectedChannels,
    currentStep: onboarding.currentStep,
    warnings,
  };
}

export function applyOnboardingStepsWithWorkspaceNumbers(
  onboarding: WorkspaceMessagingOnboardingState,
  workspaceNumbers: Array<{ type?: string | null; capabilities?: unknown }>,
): WorkspaceMessagingOnboardingState {
  return {
    ...onboarding,
    steps: buildOnboardingStepsForState(onboarding, {
      hasFirstNumber: workspaceHasFirstNumber(workspaceNumbers),
    }),
  };
}
