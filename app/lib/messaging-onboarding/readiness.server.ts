import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOnboardingStepState,
} from "@/lib/types";
import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding.server";
import { DEFAULT_WORKSPACE_ONBOARDING_STEPS } from "@/lib/messaging-onboarding/defaults.server";
import {
  checklistStepsForGoal,
  goalIncludesChecklistStep,
} from "@/lib/messaging-onboarding/goals";
import { isWorkspaceIntakeComplete } from "@/lib/messaging-onboarding/intake";
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
import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";
import {
  buildWorkspaceLaunchChecklist,
  launchChecklistProgress,
} from "@/lib/workspace-launch-checklist";

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
  audienceCount?: number;
  scriptCount?: number;
  campaignCount?: number;
  creditsBalance?: number;
};

function buildReadinessContext(
  onboarding: Omit<WorkspaceMessagingOnboardingState, "steps">,
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
  // Baseline profile fields only. Service address is collected at number rental
  // (ServiceAddressGate), not as part of the business prefix milestone.
  for (const field of BUSINESS_PROFILE_REQUIRED_FIELDS.a2p10dlc) {
    const value = ctx.onboarding.businessProfile[field];
    if (Array.isArray(value)) {
      if (value.length === 0) return false;
    } else if (typeof value === "string" ? !value.trim() : !value) {
      return false;
    }
  }
  return true;
}

function isEmergencyReady(
  onboarding: Omit<WorkspaceMessagingOnboardingState, "steps">,
): boolean {
  return (
    onboarding.emergencyVoice.address.status === "validated" &&
    onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0
  );
}

export function buildOnboardingStepsForState(
  onboarding: Omit<WorkspaceMessagingOnboardingState, "steps">,
  context: BuildOnboardingStepsContext = {},
): WorkspaceOnboardingStepState[] {
  const hasFirstNumber = context.hasFirstNumber ?? false;
  const audienceCount = context.audienceCount ?? 0;
  const scriptCount = context.scriptCount ?? 0;
  const campaignCount = context.campaignCount ?? 0;
  const creditsBalance = context.creditsBalance ?? 0;
  const ctx = buildReadinessContext(onboarding, [], context);
  const stepById = Object.fromEntries(
    DEFAULT_WORKSPACE_ONBOARDING_STEPS.map((step) => [step.id, step]),
  ) as Record<string, WorkspaceOnboardingStepState>;
  const goal = onboarding.selectedGoal;

  const businessBasicsComplete = isBusinessBasicsComplete(ctx);
  const emergencyReady = isEmergencyReady(onboarding);
  const messagingProvisioned = predicatePassed("messaging_service_provisioned", ctx);
  const pathSelected =
    predicatePassed("path_selection_complete", ctx) || Boolean(goal);
  const audienceComplete = audienceCount > 0;
  const campaignComplete = campaignCount > 0;
  const needsAudience = goalIncludesChecklistStep(goal, "audience");
  const needsCampaign = goalIncludesChecklistStep(goal, "campaign_info");
  const launchComplete =
    messagingProvisioned &&
    hasFirstNumber &&
    (!needsAudience || audienceComplete) &&
    (!needsCampaign || campaignComplete) &&
    (!onboarding.selectedChannels.includes("voice_compliance") || emergencyReady);

  const checklistStatus = (
    stepId: WizardOnboardingStepId,
  ): WorkspaceOnboardingStepState["status"] => {
    switch (stepId) {
      case "audience":
        return audienceComplete ? "complete" : "in_progress";
      case "first_number":
        return hasFirstNumber ? "complete" : "in_progress";
      case "script":
        return scriptCount > 0 ? "complete" : "in_progress";
      case "campaign_info":
        return campaignComplete ? "complete" : "in_progress";
      case "credits":
        return creditsBalance > 0 ? "complete" : "in_progress";
      case "launch_checks":
        return launchComplete ? "complete" : "pending";
      case "business_identity":
      case "business_program":
      case "path_selection":
        return "pending";
      default: {
        const _exhaustive: never = stepId;
        return _exhaustive;
      }
    }
  };

  const steps: WorkspaceOnboardingStepState[] = [
    {
      ...stepById.business_profile!,
      status: businessBasicsComplete ? "complete" : "in_progress",
    },
    {
      ...stepById.path_selection!,
      status: pathSelected ? "complete" : "in_progress",
    },
  ];

  for (const stepId of checklistStepsForGoal(goal)) {
    const template = stepById[stepId];
    if (!template) continue;
    steps.push({
      ...template,
      status: checklistStatus(stepId),
    });
  }

  return steps;
}

export type DeriveWorkspaceMessagingReadinessLaunchContext = {
  audienceCount?: number;
  scriptCount?: number;
  campaignCount?: number;
  creditsBalance?: number;
};

export function deriveWorkspaceMessagingReadiness({
  onboarding,
  workspaceNumbers,
  recentOutboundCount,
  launchContext,
}: {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceNumbers: Array<{
    phone_number?: string | null;
    type?: string | null;
    capabilities?: unknown;
  }>;
  recentOutboundCount: number;
  /** When provided, soft banner uses the launch checklist instead of redirect predicates. */
  launchContext?: DeriveWorkspaceMessagingReadinessLaunchContext;
}): WorkspaceMessagingReadiness {
  const numbers = workspaceNumbers.filter(Boolean);
  const hasLegacyTraffic = recentOutboundCount > 0 || numbers.length > 0;

  const ctx = buildReadinessContext(onboarding, numbers, {
    hasFirstNumber: workspaceHasFirstNumber(numbers),
  });

  const results = evaluateWorkspaceReadinessByIds(ctx, [
    "messaging_service_provisioned",
    "a2p_approved",
    "emergency_address_present",
    "voice_ready",
    "caller_ids_only",
    "first_number_present",
  ]);

  const warnings = results.map((result) => result.message);
  const messagingReady = predicatePassed("messaging_service_provisioned", ctx);
  const voiceReady = predicatePassed("voice_ready", ctx);
  const coreSetupComplete = isWorkspaceIntakeComplete(onboarding);
  // Fresh workspaces stay in onboarding until business basics + goal are done.
  // Path steps (audience, number, script, …) continue in the wizard; missing
  // number/address still surface as banners after core setup.
  const shouldRedirectToOnboarding = !hasLegacyTraffic && !coreSetupComplete;

  let shouldShowOnboardingBanner = false;
  if (!coreSetupComplete) {
    shouldShowOnboardingBanner = true;
  } else if (results.length > 0) {
    shouldShowOnboardingBanner = true;
  } else if (launchContext) {
    const checklist = buildWorkspaceLaunchChecklist({
      workspaceId: "workspace",
      onboarding,
      audienceCount: launchContext.audienceCount ?? 0,
      scriptCount: launchContext.scriptCount ?? 0,
      campaignCount: launchContext.campaignCount ?? 0,
      creditsBalance: launchContext.creditsBalance ?? 0,
      workspaceNumbers: numbers,
    });
    shouldShowOnboardingBanner =
      launchChecklistProgress(checklist).hasIncompleteCurrentlyDue;
  }

  return {
    shouldRedirectToOnboarding,
    shouldShowOnboardingBanner,
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
  context: Omit<BuildOnboardingStepsContext, "hasFirstNumber"> = {},
): WorkspaceMessagingOnboardingState {
  return {
    ...onboarding,
    steps: buildOnboardingStepsForState(onboarding, {
      hasFirstNumber: workspaceHasFirstNumber(workspaceNumbers),
      ...context,
    }),
  };
}
