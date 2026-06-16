import type {
  WorkspaceEmergencyAddressState,
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingReviewState,
  WorkspaceOnboardingStepState,
} from "@/lib/types";
import {
  WORKSPACE_EMERGENCY_ADDRESS_STATUS_VALUES,
  WORKSPACE_ONBOARDING_CHANNEL_VALUES,
  WORKSPACE_ONBOARDING_STATUS_VALUES,
  WORKSPACE_ONBOARDING_STEP_STATUS_VALUES,
  WORKSPACE_TWILIO_AUTH_MODE_VALUES,
} from "@/lib/types";
import { isRecord, parseOptionalString } from "@/lib/parse-utils.server";
import {
  DEFAULT_WORKSPACE_ONBOARDING_STEPS,
  WORKSPACE_MESSAGING_ONBOARDING_VERSION,
} from "@/lib/messaging-onboarding/defaults.server";
import { buildOnboardingStepsForState } from "@/lib/messaging-onboarding/readiness.server";

export function parseString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function pickEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowedValues.includes(value) ? value : fallback;
}

function normalizeStep(
  value: unknown,
  fallback: WorkspaceOnboardingStepState,
): WorkspaceOnboardingStepState {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : fallback.id,
    label: typeof value.label === "string" && value.label.trim() ? value.label : fallback.label,
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STEP_STATUS_VALUES,
      fallback.status,
    ),
    description: parseOptionalString(value.description),
  };
}

export function mergeStoredOnboardingSteps(
  storedSteps: unknown[],
): WorkspaceOnboardingStepState[] {
  const storedById = new Map<string, unknown>();
  for (const step of storedSteps) {
    if (isRecord(step) && typeof step.id === "string" && step.id.trim()) {
      storedById.set(step.id, step);
    }
  }

  return DEFAULT_WORKSPACE_ONBOARDING_STEPS.map((defaultStep) => {
    const stored = storedById.get(defaultStep.id);
    return stored ? normalizeStep(stored, defaultStep) : { ...defaultStep };
  });
}

export function normalizeEmergencyAddress(value: unknown): WorkspaceEmergencyAddressState {
  if (!isRecord(value)) {
    return {
      addressSid: null,
      customerName: "",
      street: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: "US",
      status: "not_started",
      validationError: null,
      lastValidatedAt: null,
    };
  }

  return {
    addressSid: parseOptionalString(value.addressSid),
    customerName: parseString(value.customerName),
    street: parseString(value.street),
    city: parseString(value.city),
    region: parseString(value.region),
    postalCode: parseString(value.postalCode),
    countryCode: parseString(value.countryCode) || "US",
    status: pickEnumValue(
      value.status,
      WORKSPACE_EMERGENCY_ADDRESS_STATUS_VALUES,
      "not_started",
    ),
    validationError: parseOptionalString(value.validationError),
    lastValidatedAt: parseOptionalString(value.lastValidatedAt),
  };
}

export function normalizeReviewState(value: unknown): WorkspaceOnboardingReviewState {
  if (!isRecord(value)) {
    return {
      blockingIssues: [],
      lastError: null,
      lastUpdatedAt: null,
    };
  }

  return {
    blockingIssues: parseStringArray(value.blockingIssues),
    lastError: parseOptionalString(value.lastError),
    lastUpdatedAt: parseOptionalString(value.lastUpdatedAt),
  };
}

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

  const businessProfile = isRecord(value.businessProfile)
    ? {
        legalBusinessName: parseString(value.businessProfile.legalBusinessName),
        businessType: parseString(value.businessProfile.businessType),
        websiteUrl: parseString(value.businessProfile.websiteUrl),
        privacyPolicyUrl: parseString(value.businessProfile.privacyPolicyUrl),
        termsOfServiceUrl: parseString(value.businessProfile.termsOfServiceUrl),
        supportEmail: parseString(value.businessProfile.supportEmail),
        supportPhone: parseString(value.businessProfile.supportPhone),
        useCaseSummary: parseString(value.businessProfile.useCaseSummary),
        optInWorkflow: parseString(value.businessProfile.optInWorkflow),
        optInKeywords: parseString(value.businessProfile.optInKeywords),
        optOutKeywords: parseString(value.businessProfile.optOutKeywords),
        helpKeywords: parseString(value.businessProfile.helpKeywords),
        sampleMessages: parseStringArray(value.businessProfile.sampleMessages),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile;

  const messagingService: WorkspaceMessagingOnboardingState["messagingService"] = isRecord(value.messagingService)
    ? {
        desiredSendMode:
          value.messagingService.desiredSendMode === "from_number"
            ? "from_number"
            : "messaging_service",
        serviceSid: parseOptionalString(value.messagingService.serviceSid),
        friendlyName: parseOptionalString(value.messagingService.friendlyName),
        provisioningStatus: pickEnumValue(
          value.messagingService.provisioningStatus,
          WORKSPACE_ONBOARDING_STATUS_VALUES,
          "not_started",
        ),
        attachedSenderPhoneNumbers: parseStringArray(
          value.messagingService.attachedSenderPhoneNumbers,
        ),
        supportedChannels: parseStringArray(
          value.messagingService.supportedChannels,
        ).filter(
          (channel): channel is WorkspaceOnboardingChannel =>
            WORKSPACE_ONBOARDING_CHANNEL_VALUES.includes(
              channel as WorkspaceOnboardingChannel,
            ),
        ),
        stickySenderEnabled:
          typeof value.messagingService.stickySenderEnabled === "boolean"
            ? value.messagingService.stickySenderEnabled
            : true,
        advancedOptOutEnabled:
          typeof value.messagingService.advancedOptOutEnabled === "boolean"
            ? value.messagingService.advancedOptOutEnabled
            : true,
        lastProvisionedAt: parseOptionalString(
          value.messagingService.lastProvisionedAt,
        ),
        lastError: parseOptionalString(value.messagingService.lastError),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService;

  const subaccountBootstrap = isRecord(value.subaccountBootstrap)
    ? {
        status: pickEnumValue(
          value.subaccountBootstrap.status,
          WORKSPACE_ONBOARDING_STATUS_VALUES,
          "not_started",
        ),
        authMode: pickEnumValue(
          value.subaccountBootstrap.authMode,
          WORKSPACE_TWILIO_AUTH_MODE_VALUES,
          "mixed",
        ),
        callbackBaseUrl: parseOptionalString(
          value.subaccountBootstrap.callbackBaseUrl,
        ),
        inboundVoiceUrl: parseOptionalString(
          value.subaccountBootstrap.inboundVoiceUrl,
        ),
        inboundSmsUrl: parseOptionalString(
          value.subaccountBootstrap.inboundSmsUrl,
        ),
        statusCallbackUrl: parseOptionalString(
          value.subaccountBootstrap.statusCallbackUrl,
        ),
        createdResources: parseStringArray(
          value.subaccountBootstrap.createdResources,
        ),
        featureFlags: parseStringArray(value.subaccountBootstrap.featureFlags),
        driftMessages: parseStringArray(value.subaccountBootstrap.driftMessages),
        lastSyncedAt: parseOptionalString(value.subaccountBootstrap.lastSyncedAt),
        lastError: parseOptionalString(value.subaccountBootstrap.lastError),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap;

  const emergencyVoice = isRecord(value.emergencyVoice)
    ? {
        status: pickEnumValue(
          value.emergencyVoice.status,
          WORKSPACE_ONBOARDING_STATUS_VALUES,
          "not_started",
        ),
        enabled:
          typeof value.emergencyVoice.enabled === "boolean"
            ? value.emergencyVoice.enabled
            : false,
        emergencyEligiblePhoneNumbers: parseStringArray(
          value.emergencyVoice.emergencyEligiblePhoneNumbers,
        ),
        ineligibleCallerIds: parseStringArray(
          value.emergencyVoice.ineligibleCallerIds,
        ),
        allowedCallerIdTypes: parseStringArray(
          value.emergencyVoice.allowedCallerIdTypes,
        ),
        complianceNotes: parseString(value.emergencyVoice.complianceNotes),
        address: normalizeEmergencyAddress(value.emergencyVoice.address),
        lastReviewedAt: parseOptionalString(value.emergencyVoice.lastReviewedAt),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice;

  const a2p10dlc = isRecord(value.a2p10dlc)
    ? {
        status: pickEnumValue(
          value.a2p10dlc.status,
          WORKSPACE_ONBOARDING_STATUS_VALUES,
          "not_started",
        ),
        brandSid: parseOptionalString(value.a2p10dlc.brandSid),
        campaignSid: parseOptionalString(value.a2p10dlc.campaignSid),
        trustProductSid: parseOptionalString(value.a2p10dlc.trustProductSid),
        customerProfileBundleSid: parseOptionalString(
          value.a2p10dlc.customerProfileBundleSid,
        ),
        brandType: parseOptionalString(value.a2p10dlc.brandType),
        tcrId: parseOptionalString(value.a2p10dlc.tcrId),
        rejectionReason: parseOptionalString(value.a2p10dlc.rejectionReason),
        lastSubmittedAt: parseOptionalString(value.a2p10dlc.lastSubmittedAt),
        lastSyncedAt: parseOptionalString(value.a2p10dlc.lastSyncedAt),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.a2p10dlc;

  const rcs = isRecord(value.rcs)
    ? {
        status: pickEnumValue(
          value.rcs.status,
          WORKSPACE_ONBOARDING_STATUS_VALUES,
          "not_started",
        ),
        provider: parseOptionalString(value.rcs.provider),
        agentId: parseOptionalString(value.rcs.agentId),
        senderId: parseOptionalString(value.rcs.senderId),
        displayName: parseString(value.rcs.displayName),
        publicDescription: parseString(value.rcs.publicDescription),
        logoImageUrl: parseString(value.rcs.logoImageUrl),
        bannerImageUrl: parseString(value.rcs.bannerImageUrl),
        accentColor: parseString(value.rcs.accentColor),
        optInPolicyImageUrl: parseString(value.rcs.optInPolicyImageUrl),
        useCaseVideoUrl: parseString(value.rcs.useCaseVideoUrl),
        representativeName: parseString(value.rcs.representativeName),
        representativeTitle: parseString(value.rcs.representativeTitle),
        representativeEmail: parseString(value.rcs.representativeEmail),
        notificationEmail: parseString(value.rcs.notificationEmail),
        regions: parseStringArray(value.rcs.regions),
        prerequisites: parseStringArray(value.rcs.prerequisites),
        notes: parseString(value.rcs.notes),
        lastSubmittedAt: parseOptionalString(value.rcs.lastSubmittedAt),
        lastSyncedAt: parseOptionalString(value.rcs.lastSyncedAt),
      }
    : DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs;

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
