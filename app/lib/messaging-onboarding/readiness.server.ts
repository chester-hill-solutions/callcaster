import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOnboardingStepState,
} from "@/lib/types";
import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding.server";
import { DEFAULT_WORKSPACE_ONBOARDING_STEPS } from "@/lib/messaging-onboarding/defaults.server";
import {
  type WorkspaceReadinessContext,
  type ReadinessResult,
  type WorkspaceReadinessChannel,
  BUSINESS_PROFILE_REQUIRED_FIELDS,
  WORKSPACE_READINESS_PREDICATES,
  evaluateWorkspaceReadiness,
  evaluateWorkspaceReadinessByIds,
  evaluateWorkspaceReadinessForChannels,
  predicatePassed,
  workspaceHasFirstNumber,
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  isVerifiedCallerIdNumber,
} from "@/lib/messaging-onboarding/predicates";

export {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  isVerifiedCallerIdNumber,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding/predicates";
export type {
  ReadinessResult,
  WorkspaceReadinessChannel,
  WorkspaceReadinessContext,
  WorkspaceReadinessPredicate,
  WorkspaceReadinessSenderPool,
  WorkspaceReadinessNumber,
  ReadinessResultSeverity,
  EvaluateWorkspaceReadinessOptions,
} from "@/lib/messaging-onboarding/predicates";
export {
  WORKSPACE_READINESS_PREDICATES,
  BUSINESS_PROFILE_REQUIRED_FIELDS,
  evaluateWorkspaceReadiness,
  evaluateWorkspaceReadinessByIds,
  evaluateWorkspaceReadinessForChannels,
  predicatePassed,
} from "@/lib/messaging-onboarding/predicates";

export type BuildOnboardingStepsContext = {
  hasFirstNumber?: boolean;
};

function buildReadinessContext(
  onboarding: WorkspaceMessagingOnboardingState,
  workspaceNumbers: WorkspaceReadinessContext["workspaceNumbers"],
  context: BuildOnboardingStepsContext = {},
  extras: Partial<WorkspaceReadinessContext> = {},
): WorkspaceReadinessContext {
  return {
    onboarding,
    workspaceNumbers,
    hasFirstNumber: context.hasFirstNumber,
    rcsOnboardingEnabled: isRcsOnboardingEnabled(),
    ...extras,
  };
}

function isBusinessBasicsComplete(ctx: WorkspaceReadinessContext): boolean {
  for (const field of BUSINESS_PROFILE_REQUIRED_FIELDS.a2p10dlc) {
    const value = ctx.onboarding.businessProfile[field];
    if (Array.isArray(value) ? value.length === 0 : !value || !value.trim()) {
      return false;
    }
  }
  return true;
}

function isEmergencyReady(onboarding: WorkspaceMessagingOnboardingState): boolean {
  return (
    onboarding.emergencyVoice.address.status === "validated" &&
    onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0
  );
}

export function buildOnboardingStepsForState(
  onboarding: WorkspaceMessagingOnboardingState,
  context: BuildOnboardingStepsContext = {},
): WorkspaceOnboardingStepState[] {
  const hasFirstNumber = context.hasFirstNumber ?? false;
  const ctx = buildReadinessContext(onboarding, [], context);
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

  const businessBasicsComplete = isBusinessBasicsComplete(ctx);
  const providerReady =
    predicatePassed("a2p_approved", ctx) && predicatePassed("rcs_ready", ctx);
  const emergencyReady = isEmergencyReady(onboarding);
  const messagingProvisioned = predicatePassed("messaging_service_provisioned", ctx);
  const pathSelected = predicatePassed("path_selection_complete", ctx);

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
      status: pathSelected ? "complete" : "in_progress",
    },
    {
      ...messagingServiceStep,
      status: messagingProvisioned ? "complete" : "in_progress",
    },
    {
      ...firstNumberStep,
      status: hasFirstNumber ? "complete" : "in_progress",
    },
    {
      ...providerProvisioningStep,
      status: providerReady ? "complete" : "in_progress",
    },
    {
      ...launchChecksStep,
      status:
        messagingProvisioned &&
        hasFirstNumber &&
        providerReady &&
        (!onboarding.selectedChannels.includes("voice_compliance") || emergencyReady)
          ? "complete"
          : "pending",
    },
  ];
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
  const hasLegacyTraffic = recentOutboundCount > 0 || numbers.length > 0;

  const ctx = buildReadinessContext(onboarding, numbers, {
    hasFirstNumber: workspaceHasFirstNumber(numbers),
  });

  const results = evaluateWorkspaceReadinessByIds(ctx, [
    "messaging_service_provisioned",
    "a2p_approved",
    "voice_ready",
    "caller_ids_only",
    "first_number_present",
  ]);

  const warnings = results.map((result) => result.message);
  const messagingReady = predicatePassed("messaging_service_provisioned", ctx);
  const voiceReady = predicatePassed("voice_ready", ctx);
  const shouldRedirectToOnboarding = !hasLegacyTraffic && results.length > 0;

  return {
    shouldRedirectToOnboarding,
    shouldShowOnboardingBanner: results.length > 0,
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
