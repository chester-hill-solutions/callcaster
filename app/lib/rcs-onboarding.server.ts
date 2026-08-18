import type { Database } from "@/lib/db-types";
import {
  isRcsOnboardingEnabled,
  RCS_ONBOARDING_ENABLED,
} from "@/lib/rcs-onboarding-flags";
import {
  buildOnboardingStepsForState,
  evaluateWorkspaceReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
  type WorkspaceReadinessContext,
} from "@/lib/messaging-onboarding.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";


export { RCS_ONBOARDING_ENABLED, isRcsOnboardingEnabled } from "@/lib/rcs-onboarding-flags";

export function stripDisabledRcsChannel(
  channels: WorkspaceOnboardingChannel[],
): WorkspaceOnboardingChannel[] {
  return isRcsOnboardingEnabled() ? channels : channels.filter((channel) => channel !== "rcs");
}

const DEFAULT_RCS_PREREQUISITES = [
  "Provision a Twilio Messaging Service so SMS and MMS fallback is ready before RCS launch.",
  "Prepare public brand assets, policy URLs, and opt-in evidence for Twilio Console registration.",
  "Create the Twilio RCS sender, attach webhook URLs, and submit Google or carrier compliance review.",
  "Invite test devices and confirm inbound and status callbacks before moving to production.",
];

const TWILIO_RCS_PROVIDER = "Twilio";
const TWILIO_RCS_DOCS_URL = "https://www.twilio.com/docs/rcs/onboarding";
const TWILIO_RCS_SENDERS_URL = "https://console.twilio.com/us1/develop/rcs/senders";

const COUNTRY_CODE_TO_REGION: Record<string, string> = {
  AU: "Australia",
  CA: "Canada",
  GB: "United Kingdom",
  UK: "United Kingdom",
  US: "United States",
};

function getRegionFromCountryCode(countryCode: string): string | null {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  return COUNTRY_CODE_TO_REGION[normalizedCountryCode] ?? null;
}

function getDerivedRcsState(
  onboarding: WorkspaceMessagingOnboardingState,
): WorkspaceMessagingOnboardingState["rcs"] {
  const businessProfile = onboarding.businessProfile;
  const currentRcs = onboarding.rcs;
  const derivedRegion = getRegionFromCountryCode(onboarding.emergencyVoice.address.countryCode);

  return {
    ...currentRcs,
    provider: currentRcs.provider ?? TWILIO_RCS_PROVIDER,
    displayName: currentRcs.displayName.trim() || businessProfile.legalBusinessName.trim(),
    publicDescription: currentRcs.publicDescription.trim() || businessProfile.useCaseSummary.trim(),
    notificationEmail: currentRcs.notificationEmail.trim() || businessProfile.supportEmail.trim(),
    representativeEmail:
      currentRcs.representativeEmail.trim() || businessProfile.supportEmail.trim(),
    regions: currentRcs.regions.length > 0 ? currentRcs.regions : derivedRegion ? [derivedRegion] : [],
    prerequisites:
      currentRcs.prerequisites.length > 0 ? currentRcs.prerequisites : DEFAULT_RCS_PREREQUISITES,
  };
}

export function hydrateWorkspaceRcsOnboardingStateEnabled(
  onboarding: WorkspaceMessagingOnboardingState,
): WorkspaceMessagingOnboardingState {
  const supportedChannels: WorkspaceOnboardingChannel[] =
    onboarding.selectedChannels.includes("rcs") &&
      !onboarding.messagingService.supportedChannels.includes("rcs")
      ? [...onboarding.messagingService.supportedChannels, "rcs"]
      : onboarding.messagingService.supportedChannels;
  const nextStatus =
    onboarding.selectedChannels.includes("rcs") && onboarding.rcs.status === "not_started"
      ? onboarding.messagingService.serviceSid
        ? "collecting_business"
        : "provisioning"
      : onboarding.rcs.status;

  const nextState = mergeWorkspaceMessagingOnboardingState(onboarding, {
    rcs: {
      ...getDerivedRcsState(onboarding),
      status: nextStatus,
    },
    messagingService: {
      ...onboarding.messagingService,
      supportedChannels,
    },
  });
  nextState.steps = buildOnboardingStepsForState(nextState);
  return nextState;
}

export function hydrateWorkspaceRcsOnboardingState(
  onboarding: WorkspaceMessagingOnboardingState,
): WorkspaceMessagingOnboardingState {
  if (!isRcsOnboardingEnabled()) {
    return onboarding;
  }

  return hydrateWorkspaceRcsOnboardingStateEnabled(onboarding);
}

export function getWorkspaceRcsBlockingIssues(
  onboarding: WorkspaceMessagingOnboardingState,
): string[] {
  const ctx: WorkspaceReadinessContext = {
    onboarding,
    workspaceNumbers: [],
    rcsDraft: getDerivedRcsState(onboarding),
    rcsOnboardingEnabled: isRcsOnboardingEnabled(),
  };
  const results = evaluateWorkspaceReadiness(ctx, {
    forChannel: "rcs",
    exclude: ["rcs_ready"],
    messageOverrides: {
      messaging_service_not_provisioned:
        "Provision the shared Messaging Service before starting RCS sender registration.",
    },
  });
  return results.map((result) => result.message);
}

async function persistWorkspaceRcsState({
  workspaceId,
  onboarding,
}: {
  null?: never | null;
  workspaceId: string;
  onboarding: ReturnType<typeof getWorkspaceMessagingOnboardingFromTwilioData>;
}) {
  // Atomic merge over the fresh locked row so a concurrent writer's top-level
  // keys are preserved rather than clobbered.
  await mergeWorkspaceTwilioData(workspaceId, (current) => ({
    ...current,
    onboarding,
  }));
}

export async function updateWorkspaceRcsOnboarding({
  workspaceId,
  actorUserId,
  provider,
  displayName,
  publicDescription,
  logoImageUrl,
  bannerImageUrl,
  accentColor,
  optInPolicyImageUrl,
  useCaseVideoUrl,
  representativeName,
  representativeTitle,
  representativeEmail,
  notificationEmail,
  agentId,
  senderId,
  regions,
  notes,
  status,
}: {
  workspaceId: string;
  actorUserId: string | null;
  provider: string | null;
  displayName: string;
  publicDescription: string;
  logoImageUrl: string;
  bannerImageUrl: string;
  accentColor: string;
  optInPolicyImageUrl: string;
  useCaseVideoUrl: string;
  representativeName: string;
  representativeTitle: string;
  representativeEmail: string;
  notificationEmail: string;
  agentId: string | null;
  senderId: string | null;
  regions: string[];
  notes: string;
  status: WorkspaceOnboardingStatus;
}) {
  const twilioData = (await loadWorkspaceTwilioData(workspaceId)) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const selectedChannels: WorkspaceOnboardingChannel[] = onboarding.selectedChannels.includes("rcs")
    ? onboarding.selectedChannels
    : [...onboarding.selectedChannels, "rcs"];

  let nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    selectedChannels,
    currentStep: onboarding.messagingService.serviceSid ? "provider_provisioning" : "first_number",
    status,
    rcs: {
      ...onboarding.rcs,
      status,
      provider: provider ?? onboarding.rcs.provider ?? TWILIO_RCS_PROVIDER,
      displayName,
      publicDescription,
      logoImageUrl,
      bannerImageUrl,
      accentColor,
      optInPolicyImageUrl,
      useCaseVideoUrl,
      representativeName,
      representativeTitle,
      representativeEmail,
      notificationEmail,
      agentId,
      senderId,
      regions,
      notes,
      prerequisites:
        onboarding.rcs.prerequisites.length > 0
          ? onboarding.rcs.prerequisites
          : DEFAULT_RCS_PREREQUISITES,
      lastSubmittedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });
  nextOnboarding = hydrateWorkspaceRcsOnboardingState(nextOnboarding);
  nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
    reviewState: {
      ...nextOnboarding.reviewState,
      lastUpdatedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });

  await persistWorkspaceRcsState({
    workspaceId,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}

export {
  DEFAULT_RCS_PREREQUISITES,
  TWILIO_RCS_DOCS_URL,
  TWILIO_RCS_PROVIDER,
  TWILIO_RCS_SENDERS_URL,
};
