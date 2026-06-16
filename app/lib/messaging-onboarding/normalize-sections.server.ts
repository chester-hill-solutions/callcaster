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
} from "@/lib/messaging-onboarding/defaults.server";

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

export function normalizeStep(
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

export function normalizeBusinessProfile(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["businessProfile"],
): WorkspaceMessagingOnboardingState["businessProfile"] {
  if (!isRecord(value)) return fallback;

  return {
    legalBusinessName: parseString(value.legalBusinessName),
    businessType: parseString(value.businessType),
    websiteUrl: parseString(value.websiteUrl),
    privacyPolicyUrl: parseString(value.privacyPolicyUrl),
    termsOfServiceUrl: parseString(value.termsOfServiceUrl),
    supportEmail: parseString(value.supportEmail),
    supportPhone: parseString(value.supportPhone),
    useCaseSummary: parseString(value.useCaseSummary),
    optInWorkflow: parseString(value.optInWorkflow),
    optInKeywords: parseString(value.optInKeywords),
    optOutKeywords: parseString(value.optOutKeywords),
    helpKeywords: parseString(value.helpKeywords),
    sampleMessages: parseStringArray(value.sampleMessages),
  };
}

export function normalizeMessagingServiceSection(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["messagingService"],
): WorkspaceMessagingOnboardingState["messagingService"] {
  if (!isRecord(value)) return fallback;

  return {
    desiredSendMode:
      value.desiredSendMode === "from_number" ? "from_number" : "messaging_service",
    serviceSid: parseOptionalString(value.serviceSid),
    friendlyName: parseOptionalString(value.friendlyName),
    provisioningStatus: pickEnumValue(
      value.provisioningStatus,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    attachedSenderPhoneNumbers: parseStringArray(value.attachedSenderPhoneNumbers),
    supportedChannels: parseStringArray(value.supportedChannels).filter(
      (channel): channel is WorkspaceOnboardingChannel =>
        WORKSPACE_ONBOARDING_CHANNEL_VALUES.includes(
          channel as WorkspaceOnboardingChannel,
        ),
    ),
    stickySenderEnabled:
      typeof value.stickySenderEnabled === "boolean"
        ? value.stickySenderEnabled
        : true,
    advancedOptOutEnabled:
      typeof value.advancedOptOutEnabled === "boolean"
        ? value.advancedOptOutEnabled
        : true,
    lastProvisionedAt: parseOptionalString(value.lastProvisionedAt),
    lastError: parseOptionalString(value.lastError),
  };
}

export function normalizeSubaccountBootstrapSection(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["subaccountBootstrap"],
): WorkspaceMessagingOnboardingState["subaccountBootstrap"] {
  if (!isRecord(value)) return fallback;

  return {
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    authMode: pickEnumValue(
      value.authMode,
      WORKSPACE_TWILIO_AUTH_MODE_VALUES,
      "mixed",
    ),
    callbackBaseUrl: parseOptionalString(value.callbackBaseUrl),
    inboundVoiceUrl: parseOptionalString(value.inboundVoiceUrl),
    inboundSmsUrl: parseOptionalString(value.inboundSmsUrl),
    statusCallbackUrl: parseOptionalString(value.statusCallbackUrl),
    createdResources: parseStringArray(value.createdResources),
    featureFlags: parseStringArray(value.featureFlags),
    driftMessages: parseStringArray(value.driftMessages),
    lastSyncedAt: parseOptionalString(value.lastSyncedAt),
    lastError: parseOptionalString(value.lastError),
  };
}

export function normalizeEmergencyVoiceSection(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["emergencyVoice"],
): WorkspaceMessagingOnboardingState["emergencyVoice"] {
  if (!isRecord(value)) return fallback;

  return {
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    emergencyEligiblePhoneNumbers: parseStringArray(
      value.emergencyEligiblePhoneNumbers,
    ),
    ineligibleCallerIds: parseStringArray(value.ineligibleCallerIds),
    allowedCallerIdTypes: parseStringArray(value.allowedCallerIdTypes),
    complianceNotes: parseString(value.complianceNotes),
    address: normalizeEmergencyAddress(value.address),
    lastReviewedAt: parseOptionalString(value.lastReviewedAt),
  };
}

export function normalizeA2p10dlcSection(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["a2p10dlc"],
): WorkspaceMessagingOnboardingState["a2p10dlc"] {
  if (!isRecord(value)) return fallback;

  return {
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    brandSid: parseOptionalString(value.brandSid),
    campaignSid: parseOptionalString(value.campaignSid),
    trustProductSid: parseOptionalString(value.trustProductSid),
    customerProfileBundleSid: parseOptionalString(value.customerProfileBundleSid),
    brandType: parseOptionalString(value.brandType),
    tcrId: parseOptionalString(value.tcrId),
    rejectionReason: parseOptionalString(value.rejectionReason),
    lastSubmittedAt: parseOptionalString(value.lastSubmittedAt),
    lastSyncedAt: parseOptionalString(value.lastSyncedAt),
  };
}

export function normalizeRcsSection(
  value: unknown,
  fallback: WorkspaceMessagingOnboardingState["rcs"],
): WorkspaceMessagingOnboardingState["rcs"] {
  if (!isRecord(value)) return fallback;

  return {
    status: pickEnumValue(
      value.status,
      WORKSPACE_ONBOARDING_STATUS_VALUES,
      "not_started",
    ),
    provider: parseOptionalString(value.provider),
    agentId: parseOptionalString(value.agentId),
    senderId: parseOptionalString(value.senderId),
    displayName: parseString(value.displayName),
    publicDescription: parseString(value.publicDescription),
    logoImageUrl: parseString(value.logoImageUrl),
    bannerImageUrl: parseString(value.bannerImageUrl),
    accentColor: parseString(value.accentColor),
    optInPolicyImageUrl: parseString(value.optInPolicyImageUrl),
    useCaseVideoUrl: parseString(value.useCaseVideoUrl),
    representativeName: parseString(value.representativeName),
    representativeTitle: parseString(value.representativeTitle),
    representativeEmail: parseString(value.representativeEmail),
    notificationEmail: parseString(value.notificationEmail),
    regions: parseStringArray(value.regions),
    prerequisites: parseStringArray(value.prerequisites),
    notes: parseString(value.notes),
    lastSubmittedAt: parseOptionalString(value.lastSubmittedAt),
    lastSyncedAt: parseOptionalString(value.lastSyncedAt),
  };
}
