import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type {
  TwilioAccountData,
  WorkspaceEmergencyAddressState,
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingReviewState,
  WorkspaceOnboardingStatus,
  WorkspaceOnboardingStepState,
} from "@/lib/types";
import {
  WORKSPACE_EMERGENCY_ADDRESS_STATUS_VALUES,
  WORKSPACE_ONBOARDING_CHANNEL_VALUES,
  WORKSPACE_ONBOARDING_STATUS_VALUES,
  WORKSPACE_ONBOARDING_STEP_STATUS_VALUES,
  WORKSPACE_TWILIO_AUTH_MODE_VALUES,
} from "@/lib/types";

const WORKSPACE_MESSAGING_ONBOARDING_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function pickEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowedValues.includes(value) ? value : fallback;
}

function normalizeStep(value: unknown, fallback: WorkspaceOnboardingStepState): WorkspaceOnboardingStepState {
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

export const DEFAULT_WORKSPACE_ONBOARDING_STEPS: WorkspaceOnboardingStepState[] = [
  {
    id: "business_profile",
    label: "Business basics",
    status: "pending",
    description: "Start with the legal business identity, website, and support contact details.",
  },
  {
    id: "use_case",
    label: "Messaging use case",
    status: "pending",
    description: "Explain what you send, how people opt in, and include sample messages.",
  },
  {
    id: "path_selection",
    label: "Channel selection",
    status: "pending",
    description: "Choose which messaging and voice tracks this workspace actually needs.",
  },
  {
    id: "messaging_service",
    label: "Messaging Service",
    status: "pending",
    description: "Provision or confirm the shared Messaging Service used for sending.",
  },
  {
    id: "provider_provisioning",
    label: "Provider provisioning",
    status: "pending",
    description: "Create provider resources and track carrier or provider review.",
  },
  {
    id: "launch_checks",
    label: "Launch checks",
    status: "pending",
    description: "Confirm sender attachment, readiness, and compatibility.",
  },
];

function normalizeEmergencyAddress(value: unknown): WorkspaceEmergencyAddressState {
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

function normalizeReviewState(value: unknown): WorkspaceOnboardingReviewState {
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
      steps: buildOnboardingStepsForState(defaultState),
    };
  }

  const steps =
    Array.isArray(value.steps) && value.steps.length > 0
      ? value.steps.map((step, index) =>
          normalizeStep(step, DEFAULT_WORKSPACE_ONBOARDING_STEPS[
            Math.min(index, DEFAULT_WORKSPACE_ONBOARDING_STEPS.length - 1)
          ]!),
        )
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
    steps: buildOnboardingStepsForState(normalizedState),
  };
}

export function getWorkspaceMessagingOnboardingFromTwilioData(
  twilioData: TwilioAccountData | unknown,
): WorkspaceMessagingOnboardingState {
  if (!isRecord(twilioData)) {
    return normalizeWorkspaceMessagingOnboardingState(null);
  }

  return normalizeWorkspaceMessagingOnboardingState(twilioData.onboarding);
}

function mergeUniqueStrings(values: Array<string | null | undefined>): string[] {
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

export async function getWorkspaceMessagingOnboardingState({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  return getWorkspaceMessagingOnboardingFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );
}

export async function updateWorkspaceMessagingOnboardingState({
  supabaseClient,
  workspaceId,
  updates,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  updates: Partial<WorkspaceMessagingOnboardingState>;
  actorUserId: string | null;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const currentTwilioData = isRecord(data?.twilio_data) ? data.twilio_data : {};
  const currentState = getWorkspaceMessagingOnboardingFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );
  const nextState = mergeWorkspaceMessagingOnboardingState(currentState, {
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: actorUserId,
  });

  const nextTwilioData = {
    ...currentTwilioData,
    onboarding: nextState,
  };

  const { error: updateError } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data:
        nextTwilioData as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (updateError) {
    throw updateError;
  }

  return nextState;
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
    warnings.push("Only verified caller IDs are present, so voice readiness remains limited.");
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

export function buildOnboardingStepsForState(
  onboarding: WorkspaceMessagingOnboardingState,
): WorkspaceOnboardingStepState[] {
  const [businessProfileStep, useCaseStep, pathSelectionStep, messagingServiceStep, providerProvisioningStep, launchChecksStep] =
    DEFAULT_WORKSPACE_ONBOARDING_STEPS;
  const emergencyReady =
    onboarding.emergencyVoice.address.status === "validated" &&
    onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0;
  const providerReady =
    (!onboarding.selectedChannels.includes("a2p10dlc") ||
      onboarding.a2p10dlc.status === "approved" ||
      onboarding.a2p10dlc.status === "live") &&
    (!onboarding.selectedChannels.includes("rcs") ||
      onboarding.rcs.status === "approved" ||
      onboarding.rcs.status === "live" ||
      onboarding.rcs.status === "in_review");

  return [
    {
      ...businessProfileStep!,
      status:
        onboarding.businessProfile.legalBusinessName &&
        onboarding.businessProfile.websiteUrl
          ? "complete"
          : "in_progress",
    },
    {
      ...useCaseStep!,
      status:
        onboarding.businessProfile.useCaseSummary &&
        onboarding.businessProfile.sampleMessages.length > 0
          ? "complete"
          : "in_progress",
    },
    {
      ...pathSelectionStep!,
      status: onboarding.selectedChannels.length > 0 ? "complete" : "in_progress",
    },
    {
      ...messagingServiceStep!,
      status: onboarding.messagingService.serviceSid ? "complete" : "in_progress",
    },
    {
      ...providerProvisioningStep!,
      status: providerReady ? "complete" : "in_progress",
    },
    {
      ...launchChecksStep!,
      status:
        onboarding.messagingService.serviceSid &&
        providerReady &&
        (!onboarding.selectedChannels.includes("voice_compliance") || emergencyReady)
          ? "complete"
          : "pending",
    },
  ];
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
