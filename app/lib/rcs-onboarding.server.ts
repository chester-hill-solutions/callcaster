import type { Database } from "@/lib/db-types";
import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  loadWorkspaceTwilioData,
  persistWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";

import { isObject } from "@/lib/type-safety-utils";

export const RCS_ONBOARDING_ENABLED = false;

export function isRcsOnboardingEnabled(): boolean {
  return RCS_ONBOARDING_ENABLED;
}

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
  const rcsDraft = getDerivedRcsState(onboarding);
  const businessProfile = onboarding.businessProfile;
  const issues: string[] = [];

  if (!onboarding.selectedChannels.includes("rcs")) {
    issues.push("Enable the RCS channel in channel selection before preparing the sender package.");
  }
  if (!onboarding.messagingService.serviceSid) {
    issues.push("Provision the shared Messaging Service before starting RCS sender registration.");
  }
  if (!businessProfile.legalBusinessName.trim()) {
    issues.push("Add the legal business name in Business basics.");
  }
  if (!businessProfile.websiteUrl.trim()) {
    issues.push("Add the public website URL in Business basics.");
  }
  if (!businessProfile.privacyPolicyUrl.trim()) {
    issues.push("Add the privacy policy URL in Business basics.");
  }
  if (!businessProfile.termsOfServiceUrl.trim()) {
    issues.push("Add the terms of service URL in Business basics.");
  }
  if (!businessProfile.supportEmail.trim()) {
    issues.push("Add a support email in Business basics.");
  }
  if (!businessProfile.useCaseSummary.trim()) {
    issues.push("Describe the messaging use case in Business basics.");
  }
  if (!businessProfile.optInWorkflow.trim()) {
    issues.push("Describe the opt-in workflow in Business basics.");
  }
  if (businessProfile.sampleMessages.length === 0) {
    issues.push("Add at least one sample message in Business basics.");
  }
  if (!rcsDraft.displayName.trim()) {
    issues.push("Add the RCS sender display name.");
  }
  if (!rcsDraft.publicDescription.trim()) {
    issues.push("Add the public RCS sender description.");
  }
  if (!rcsDraft.notificationEmail.trim()) {
    issues.push("Add the RCS notification email.");
  }
  if (!rcsDraft.representativeName.trim()) {
    issues.push("Add the authorized representative name.");
  }
  if (!rcsDraft.representativeTitle.trim()) {
    issues.push("Add the authorized representative title.");
  }
  if (!rcsDraft.representativeEmail.trim()) {
    issues.push("Add the authorized representative email.");
  }
  if (!rcsDraft.logoImageUrl.trim()) {
    issues.push("Upload a square logo image URL for the sender package.");
  }
  if (!rcsDraft.bannerImageUrl.trim()) {
    issues.push("Upload a banner image URL for the sender package.");
  }
  if (!rcsDraft.optInPolicyImageUrl.trim()) {
    issues.push("Upload an opt-in policy or consent screenshot URL.");
  }
  if (!rcsDraft.useCaseVideoUrl.trim()) {
    issues.push("Upload a use case video URL for Twilio review.");
  }
  if (rcsDraft.regions.length === 0) {
    issues.push("List at least one destination country for the RCS sender.");
  }

  return issues;
}

async function persistWorkspaceRcsState({
  workspaceId,
  twilioData,
  onboarding,
}: {
  null?: never | null;
  workspaceId: string;
  twilioData: TwilioAccountData;
  onboarding: ReturnType<typeof getWorkspaceMessagingOnboardingFromTwilioData>;
}) {
  const baseData = isObject(twilioData) ? twilioData : {};
  await persistWorkspaceTwilioData(workspaceId, {
    ...baseData,
    onboarding,
  });
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
    currentStep: onboarding.messagingService.serviceSid ? "provider_provisioning" : "messaging_service",
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
    steps: buildOnboardingStepsForState(nextOnboarding),
    reviewState: {
      ...nextOnboarding.reviewState,
      lastUpdatedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });

  await persistWorkspaceRcsState({
    workspaceId,
    twilioData,
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
