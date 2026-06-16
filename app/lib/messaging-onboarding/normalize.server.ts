import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import {
  WORKSPACE_ONBOARDING_CHANNEL_VALUES,
  WORKSPACE_ONBOARDING_STATUS_VALUES,
} from "@/lib/types";
import { isRecord, parseOptionalString } from "@/lib/parse-utils.server";
import {
  DEFAULT_WORKSPACE_ONBOARDING_STEPS,
  WORKSPACE_MESSAGING_ONBOARDING_VERSION,
} from "@/lib/messaging-onboarding/defaults.server";
import { buildOnboardingStepsForState } from "@/lib/messaging-onboarding/readiness.server";
import type { WorkspaceOnboardingChannel } from "@/lib/types";
import {
  mergeStoredOnboardingSteps,
  normalizeA2p10dlcSection,
  normalizeBusinessProfile,
  normalizeEmergencyAddress,
  normalizeEmergencyVoiceSection,
  normalizeMessagingServiceSection,
  normalizeRcsSection,
  normalizeReviewState,
  normalizeSubaccountBootstrapSection,
  parseStringArray,
  pickEnumValue,
} from "@/lib/messaging-onboarding/normalize-sections.server";

export {
  parseString,
  parseStringArray,
  pickEnumValue,
  normalizeStep,
  mergeStoredOnboardingSteps,
  normalizeEmergencyAddress,
  normalizeReviewState,
} from "@/lib/messaging-onboarding/normalize-sections.server";

export const DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE: WorkspaceMessagingOnboardingState = {
  version: WORKSPACE_MESSAGING_ONBOARDING_VERSION,
  status: "not_started",
  currentStep: "business_profile",
  selectedChannels: ["a2p10dlc", "voice_compliance"],
  steps: DEFAULT_WORKSPACE_ONBOARDING_STEPS,
  businessProfile: {
    legalBusinessName: "",
    businessType: "",
    websiteUrl: "",
    privacyPolicyUrl: "",
    termsOfServiceUrl: "",
    supportEmail: "",
    supportPhone: "",
    useCaseSummary: "",
    optInWorkflow: "",
    optInKeywords: "",
    optOutKeywords: "",
    helpKeywords: "",
    sampleMessages: [],
  },
  messagingService: {
    desiredSendMode: "messaging_service",
    serviceSid: null,
    friendlyName: null,
    provisioningStatus: "not_started",
    attachedSenderPhoneNumbers: [],
    supportedChannels: [],
    stickySenderEnabled: true,
    advancedOptOutEnabled: true,
    lastProvisionedAt: null,
    lastError: null,
  },
  subaccountBootstrap: {
    status: "not_started",
    authMode: "mixed",
    callbackBaseUrl: null,
    inboundVoiceUrl: null,
    inboundSmsUrl: null,
    statusCallbackUrl: null,
    createdResources: [],
    featureFlags: [
      "messaging_service",
      "sticky_sender",
      "advanced_opt_out",
      "future_channel_onboarding",
    ],
    driftMessages: [],
    lastSyncedAt: null,
    lastError: null,
  },
  emergencyVoice: {
    status: "not_started",
    enabled: false,
    emergencyEligiblePhoneNumbers: [],
    ineligibleCallerIds: [],
    allowedCallerIdTypes: ["rented"],
    complianceNotes: "",
    address: normalizeEmergencyAddress(null),
    lastReviewedAt: null,
  },
  a2p10dlc: {
    status: "not_started",
    brandSid: null,
    campaignSid: null,
    trustProductSid: null,
    customerProfileBundleSid: null,
    brandType: null,
    tcrId: null,
    rejectionReason: null,
    lastSubmittedAt: null,
    lastSyncedAt: null,
  },
  rcs: {
    status: "not_started",
    provider: null,
    agentId: null,
    senderId: null,
    displayName: "",
    publicDescription: "",
    logoImageUrl: "",
    bannerImageUrl: "",
    accentColor: "",
    optInPolicyImageUrl: "",
    useCaseVideoUrl: "",
    representativeName: "",
    representativeTitle: "",
    representativeEmail: "",
    notificationEmail: "",
    regions: [],
    prerequisites: [],
    notes: "",
    lastSubmittedAt: null,
    lastSyncedAt: null,
  },
  reviewState: normalizeReviewState(null),
  lastUpdatedAt: null,
  lastUpdatedBy: null,
};

export function normalizeWorkspaceMessagingOnboardingState(
  value: unknown,
): WorkspaceMessagingOnboardingState {
  if (!isRecord(value)) {
    const defaultState = {
      ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      steps: DEFAULT_WORKSPACE_ONBOARDING_STEPS.map((step) => ({ ...step })),
    };

    return {
      ...defaultState,
      steps: buildOnboardingStepsForState(defaultState, { hasFirstNumber: false }),
    };
  }

  const steps =
    Array.isArray(value.steps) && value.steps.length > 0
      ? mergeStoredOnboardingSteps(value.steps)
      : DEFAULT_WORKSPACE_ONBOARDING_STEPS.map((step) => ({ ...step }));

  const selectedChannels = parseStringArray(value.selectedChannels).filter(
    (channel): channel is WorkspaceOnboardingChannel =>
      WORKSPACE_ONBOARDING_CHANNEL_VALUES.includes(
        channel as WorkspaceOnboardingChannel,
      ),
  );

  const businessProfile = normalizeBusinessProfile(
    value.businessProfile,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile,
  );

  const messagingService = normalizeMessagingServiceSection(
    value.messagingService,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
  );

  const subaccountBootstrap = normalizeSubaccountBootstrapSection(
    value.subaccountBootstrap,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap,
  );

  const emergencyVoice = normalizeEmergencyVoiceSection(
    value.emergencyVoice,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
  );

  const a2p10dlc = normalizeA2p10dlcSection(
    value.a2p10dlc,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.a2p10dlc,
  );

  const rcs = normalizeRcsSection(
    value.rcs,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
  );

  const normalizedState = {
    version:
      typeof value.version === "number"
        ? value.version
        : WORKSPACE_MESSAGING_ONBOARDING_VERSION,
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    currentStep: parseOptionalString(value.currentStep) ?? "business_profile",
    selectedChannels:
      selectedChannels.length > 0
        ? selectedChannels
        : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.selectedChannels,
    steps,
    businessProfile,
    messagingService,
    subaccountBootstrap,
    emergencyVoice,
    a2p10dlc,
    rcs,
    reviewState: normalizeReviewState(value.reviewState),
    lastUpdatedAt: parseOptionalString(value.lastUpdatedAt),
    lastUpdatedBy: parseOptionalString(value.lastUpdatedBy),
  };

  return {
    ...normalizedState,
    steps: buildOnboardingStepsForState(normalizedState, { hasFirstNumber: false }),
  };
}
