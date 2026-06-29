import type {
  WorkspaceMessagingBusinessProfile,
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingChannel,
} from "@/lib/types";

/**
 * Non-`.server.ts` module: the single workspace readiness predicate table and the
 * shared `ReadinessResult` shape. Both client UI and server evaluators import from
 * here so predicate logic is not duplicated and client UI does not pull `.server.ts`
 * transitives.
 */

export type ReadinessResultSeverity = "error" | "warning" | "info";

export type ReadinessResult = {
  code: string;
  message: string;
  severity: ReadinessResultSeverity;
};

export type WorkspaceReadinessChannel =
  | "a2p10dlc"
  | "rcs"
  | "voice_compliance"
  | "sms"
  | "all";

export type WorkspaceReadinessNumber = {
  phone_number?: string | null;
  type?: string | null;
  capabilities?: unknown;
};

export type WorkspaceReadinessSenderPool = {
  inSync: boolean;
  missingFromPool: string[];
  livePhoneNumbers: string[];
};

export type WorkspaceReadinessContext = {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceNumbers: WorkspaceReadinessNumber[];
  recentOutboundCount?: number;
  /** Precomputed first-number flag; falls back to `workspaceHasFirstNumber`. */
  hasFirstNumber?: boolean;
  /** Populated by server evaluators (RCS gate is a server config constant). */
  rcsOnboardingEnabled?: boolean;
  /** Populated by the send-gate evaluator (sender pool requires a live Twilio call). */
  senderPool?: WorkspaceReadinessSenderPool;
  portalConfig?: { sendMode?: string | null };
  syncSnapshot?: { tollFreeVerificationBlocked?: boolean };
  /** Derived RCS sender draft (server evaluators hydrate this from business profile). */
  rcsDraft?: WorkspaceMessagingOnboardingState["rcs"];
};

export type WorkspaceReadinessPredicate = {
  id: string;
  /** Returns `true` when the predicate is satisfied (ready). `false` emits a result. */
  test: (ctx: WorkspaceReadinessContext) => boolean;
  blockingFor: readonly WorkspaceReadinessChannel[];
  code: string;
  message: string;
  severity: ReadinessResultSeverity;
  /** Optional dynamic message override (e.g. lists of missing sender-pool numbers). */
  buildMessage?: (ctx: WorkspaceReadinessContext) => string;
};

const CHANNELS_REQUIRING_BUSINESS_PROFILE: readonly (keyof typeof BUSINESS_PROFILE_REQUIRED_FIELDS)[] = [
  "a2p10dlc",
  "rcs",
  "sms",
];

/**
 * Per-channel business-profile required fields — one source of truth.
 * A2P/SMS require 4 fields; RCS requires 8 (adds policy URLs, support email, opt-in workflow).
 */
export const BUSINESS_PROFILE_REQUIRED_FIELDS: Record<
  Exclude<WorkspaceReadinessChannel, "all" | "voice_compliance">,
  readonly (keyof WorkspaceMessagingBusinessProfile)[]
> = {
  a2p10dlc: [
    "legalBusinessName",
    "websiteUrl",
    "useCaseSummary",
    "sampleMessages",
  ],
  rcs: [
    "legalBusinessName",
    "websiteUrl",
    "useCaseSummary",
    "sampleMessages",
    "privacyPolicyUrl",
    "termsOfServiceUrl",
    "supportEmail",
    "optInWorkflow",
  ],
  sms: [
    "legalBusinessName",
    "websiteUrl",
    "useCaseSummary",
    "sampleMessages",
  ],
};

export type BusinessProfileFieldKey = keyof WorkspaceMessagingBusinessProfile;

function isBusinessProfileFieldComplete(
  profile: WorkspaceMessagingBusinessProfile,
  field: BusinessProfileFieldKey,
): boolean {
  const value = profile[field];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

const BUSINESS_PROFILE_FIELD_MESSAGES: Record<
  BusinessProfileFieldKey,
  Partial<Record<WorkspaceReadinessChannel, string>>
> = {
  legalBusinessName: {
    a2p10dlc: "Legal business name is required.",
    sms: "Legal business name is required.",
    rcs: "Add the legal business name in Business basics.",
  },
  websiteUrl: {
    a2p10dlc: "Website URL is required.",
    sms: "Website URL is required.",
    rcs: "Add the public website URL in Business basics.",
  },
  useCaseSummary: {
    a2p10dlc: "Use case summary is required.",
    sms: "Use case summary is required.",
    rcs: "Describe the messaging use case in Business basics.",
  },
  sampleMessages: {
    a2p10dlc: "At least one sample message is required.",
    sms: "At least one sample message is required.",
    rcs: "Add at least one sample message in Business basics.",
  },
  privacyPolicyUrl: {
    rcs: "Add the privacy policy URL in Business basics.",
  },
  termsOfServiceUrl: {
    rcs: "Add the terms of service URL in Business basics.",
  },
  supportEmail: {
    rcs: "Add a support email in Business basics.",
  },
  optInWorkflow: {
    rcs: "Describe the opt-in workflow in Business basics.",
  },
  businessType: {},
  supportPhone: {},
  optInKeywords: {},
  optOutKeywords: {},
  helpKeywords: {},
};

function buildBusinessProfileFieldPredicates(): WorkspaceReadinessPredicate[] {
  const predicates: WorkspaceReadinessPredicate[] = [];
  for (const channel of CHANNELS_REQUIRING_BUSINESS_PROFILE) {
    const fields = BUSINESS_PROFILE_REQUIRED_FIELDS[channel];
    for (const field of fields) {
      const message = BUSINESS_PROFILE_FIELD_MESSAGES[field][channel];
      if (!message) {
        continue;
      }
      predicates.push({
        id: `business_profile.${field}.${channel}`,
        test: (ctx) =>
          isBusinessProfileFieldComplete(ctx.onboarding.businessProfile, field),
        blockingFor: [channel],
        code: `business_profile_${field}_required`,
        message,
        severity: "error",
      });
    }
  }
  return predicates;
}

function isCanadianBusiness(ctx: WorkspaceReadinessContext): boolean {
  const code = ctx.onboarding.emergencyVoice.address.countryCode
    .trim()
    .toUpperCase();
  return code === "CA" || code === "CANADA";
}

function sendViaMessagingService(ctx: WorkspaceReadinessContext): boolean {
  return (
    ctx.portalConfig?.sendMode === "messaging_service" ||
    ctx.onboarding.messagingService.desiredSendMode === "messaging_service"
  );
}

const RCS_SENDER_PACKAGE_FIELDS: Array<{
  field: keyof WorkspaceMessagingOnboardingState["rcs"];
  message: string;
}> = [
  { field: "displayName", message: "Add the RCS sender display name." },
  { field: "publicDescription", message: "Add the public RCS sender description." },
  { field: "notificationEmail", message: "Add the RCS notification email." },
  { field: "representativeName", message: "Add the authorized representative name." },
  { field: "representativeTitle", message: "Add the authorized representative title." },
  { field: "representativeEmail", message: "Add the authorized representative email." },
  { field: "logoImageUrl", message: "Upload a square logo image URL for the sender package." },
  { field: "bannerImageUrl", message: "Upload a banner image URL for the sender package." },
  {
    field: "optInPolicyImageUrl",
    message: "Upload an opt-in policy or consent screenshot URL.",
  },
  { field: "useCaseVideoUrl", message: "Upload a use case video URL for Twilio review." },
];

function buildRcsSenderPackagePredicates(): WorkspaceReadinessPredicate[] {
  return RCS_SENDER_PACKAGE_FIELDS.map(({ field, message }) => ({
    id: `rcs_sender.${field}`,
    test: (ctx) => {
      const draft = ctx.rcsDraft ?? ctx.onboarding.rcs;
      const value = draft[field];
      return typeof value === "string" && value.trim().length > 0;
    },
    blockingFor: ["rcs"] as const,
    code: `rcs_sender_${field}_required`,
    message,
    severity: "error" as const,
  }));
}

const CORE_PREDICATES: WorkspaceReadinessPredicate[] = [
  {
    id: "messaging_service_provisioned",
    test: (ctx) => Boolean(ctx.onboarding.messagingService.serviceSid),
    blockingFor: ["a2p10dlc", "rcs", "sms", "voice_compliance"] as const,
    code: "messaging_service_not_provisioned",
    message: "Messaging Service has not been provisioned yet.",
    severity: "error" as const,
  },
  {
    id: "a2p_approved",
    test: (ctx) =>
      !ctx.onboarding.selectedChannels.includes("a2p10dlc") ||
      isCanadianBusiness(ctx) ||
      ctx.onboarding.a2p10dlc.status === "approved" ||
      ctx.onboarding.a2p10dlc.status === "live",
    blockingFor: ["a2p10dlc"] as const,
    code: "a2p_not_approved",
    message: "A2P 10DLC registration is not approved yet.",
    severity: "error" as const,
  },
  {
    id: "voice_ready",
    test: (ctx) =>
      !ctx.onboarding.selectedChannels.includes("voice_compliance") ||
      (ctx.onboarding.emergencyVoice.enabled &&
        ctx.onboarding.emergencyVoice.address.status === "validated" &&
        ctx.onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0),
    blockingFor: ["voice_compliance"] as const,
    code: "voice_not_ready",
    message: "Emergency voice readiness is incomplete.",
    severity: "error" as const,
  },
  {
    id: "rcs_ready",
    test: (ctx) =>
      ctx.rcsOnboardingEnabled === false ||
      !ctx.onboarding.selectedChannels.includes("rcs") ||
      ctx.onboarding.rcs.status === "approved" ||
      ctx.onboarding.rcs.status === "live" ||
      ctx.onboarding.rcs.status === "in_review",
    blockingFor: ["rcs"] as const,
    code: "rcs_not_ready",
    message: "RCS sender registration is not approved yet.",
    severity: "error" as const,
  },
  {
    id: "first_number_present",
    test: (ctx) =>
      ctx.hasFirstNumber ?? workspaceHasFirstNumber(ctx.workspaceNumbers),
    blockingFor: ["all"] as const,
    code: "no_first_number",
    message: "No phone number yet.",
    severity: "warning" as const,
  },
  {
    id: "caller_ids_only",
    test: (ctx) => {
      const numbers = ctx.workspaceNumbers.filter(Boolean);
      const callerIds = numbers.filter((n) => n.type === "caller_id");
      const rented = numbers.filter((n) => n.type === "rented");
      return !(callerIds.length > 0 && rented.length === 0);
    },
    blockingFor: ["all"] as const,
    code: "caller_ids_only",
    message:
      "Only verified caller IDs are present. Outbound is supported, but inbound SMS and calls require a rented number.",
    severity: "warning" as const,
  },
  {
    id: "path_selection_complete",
    test: (ctx) => ctx.onboarding.selectedChannels.length > 0,
    blockingFor: ["all"] as const,
    code: "path_selection_required",
    message: "Select at least one messaging channel.",
    severity: "warning" as const,
  },
  {
    id: "sender_pool_in_sync",
    test: (ctx) => {
      if (!ctx.senderPool || !sendViaMessagingService(ctx)) return true;
      return ctx.senderPool.inSync && ctx.senderPool.missingFromPool.length === 0;
    },
    blockingFor: ["sms"] as const,
    code: "sender_pool_missing_numbers",
    message: "Sender pool is missing numbers.",
    severity: "error" as const,
    buildMessage: (ctx) =>
      ctx.senderPool && ctx.senderPool.missingFromPool.length > 0
        ? `Sender pool is missing numbers: ${ctx.senderPool.missingFromPool.join(", ")}.`
        : "Sender pool is missing numbers.",
  },
  {
    id: "sender_pool_has_senders",
    test: (ctx) => {
      if (!ctx.senderPool || !sendViaMessagingService(ctx)) return true;
      return ctx.senderPool.livePhoneNumbers.length > 0;
    },
    blockingFor: ["sms"] as const,
    code: "sender_pool_empty",
    message: "Messaging Service has no senders in the Twilio sender pool.",
    severity: "error" as const,
  },
  {
    id: "toll_free_verified",
    test: (ctx) => !ctx.syncSnapshot?.tollFreeVerificationBlocked,
    blockingFor: ["sms"] as const,
    code: "toll_free_verification_blocked",
    message:
      "Toll-free verification is pending or rejected. Bulk SMS is blocked until Twilio approves verification.",
    severity: "error" as const,
  },
  {
    id: "a2p_customer_profile_bundle",
    test: (ctx) => Boolean(ctx.onboarding.a2p10dlc.customerProfileBundleSid),
    blockingFor: ["a2p10dlc"] as const,
    code: "a2p_customer_profile_bundle_required",
    message:
      "Customer Profile Bundle SID is required before A2P registration can be submitted.",
    severity: "error" as const,
  },
  {
    id: "a2p_trust_product",
    test: (ctx) => Boolean(ctx.onboarding.a2p10dlc.trustProductSid),
    blockingFor: ["a2p10dlc"] as const,
    code: "a2p_trust_product_required",
    message:
      "A2P Messaging Profile Bundle SID is required before A2P registration can be submitted.",
    severity: "error" as const,
  },
  {
    id: "rcs_channel_selected",
    test: (ctx) => ctx.onboarding.selectedChannels.includes("rcs"),
    blockingFor: ["rcs"] as const,
    code: "rcs_channel_not_selected",
    message:
      "Enable the RCS channel in channel selection before preparing the sender package.",
    severity: "error" as const,
  },
  {
    id: "rcs_regions_selected",
    test: (ctx) => (ctx.rcsDraft ?? ctx.onboarding.rcs).regions.length > 0,
    blockingFor: ["rcs"] as const,
    code: "rcs_regions_required",
    message: "List at least one destination country for the RCS sender.",
    severity: "error" as const,
  },
];

export const WORKSPACE_READINESS_PREDICATES: readonly WorkspaceReadinessPredicate[] = [
  ...CORE_PREDICATES,
  ...buildBusinessProfileFieldPredicates(),
  ...buildRcsSenderPackagePredicates(),
];

export function predicateAppliesTo(
  predicate: WorkspaceReadinessPredicate,
  channel: WorkspaceReadinessChannel,
): boolean {
  return predicate.blockingFor.includes(channel);
}

export type EvaluateWorkspaceReadinessOptions = {
  forChannel?: WorkspaceReadinessChannel;
  /** Restrict evaluation to predicates whose id is in this allowlist. */
  include?: readonly string[];
  /** Skip predicates whose id is in this denylist. */
  exclude?: readonly string[];
  /** Per-code message overrides so evaluators can keep their own wording. */
  messageOverrides?: Record<string, string>;
};

function resultFromPredicate(
  predicate: WorkspaceReadinessPredicate,
  ctx: WorkspaceReadinessContext,
  messageOverrides?: Record<string, string>,
): ReadinessResult {
  const message = predicate.buildMessage
    ? predicate.buildMessage(ctx)
    : messageOverrides?.[predicate.code] ?? predicate.message;
  return {
    code: predicate.code,
    message,
    severity: predicate.severity,
  };
}

export function evaluateWorkspaceReadiness(
  ctx: WorkspaceReadinessContext,
  options: EvaluateWorkspaceReadinessOptions = {},
): ReadinessResult[] {
  const channel = options.forChannel ?? "all";
  const include = options.include
    ? new Set(options.include)
    : null;
  const exclude = options.exclude ? new Set(options.exclude) : null;
  const results: ReadinessResult[] = [];
  for (const predicate of WORKSPACE_READINESS_PREDICATES) {
    if (include && !include.has(predicate.id)) continue;
    if (exclude && exclude.has(predicate.id)) continue;
    if (options.forChannel && !predicateAppliesTo(predicate, channel)) continue;
    if (predicate.test(ctx)) continue;
    results.push(resultFromPredicate(predicate, ctx, options.messageOverrides));
  }
  return results;
}

export function evaluateWorkspaceReadinessByIds(
  ctx: WorkspaceReadinessContext,
  predicateIds: readonly string[],
  messageOverrides?: Record<string, string>,
): ReadinessResult[] {
  return evaluateWorkspaceReadiness(ctx, {
    include: predicateIds,
    messageOverrides,
  });
}

export function evaluateWorkspaceReadinessForChannels(
  ctx: WorkspaceReadinessContext,
  channels: readonly WorkspaceReadinessChannel[],
  messageOverrides?: Record<string, string>,
): ReadinessResult[] {
  const results: ReadinessResult[] = [];
  const seen = new Set<string>();
  for (const channel of channels) {
    for (const result of evaluateWorkspaceReadiness(ctx, {
      forChannel: channel,
      messageOverrides,
    })) {
      const key = `${result.code}:${result.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(result);
    }
  }
  return results;
}

export function predicatePassed(
  predicateId: string,
  ctx: WorkspaceReadinessContext,
): boolean {
  const predicate = WORKSPACE_READINESS_PREDICATES.find((p) => p.id === predicateId);
  return predicate ? predicate.test(ctx) : true;
}

function countRentedWorkspaceNumbers(
  workspaceNumbers: WorkspaceReadinessNumber[],
): number {
  return workspaceNumbers.filter((number) => number.type === "rented").length;
}

function countVerifiedCallerIdNumbers(
  workspaceNumbers: WorkspaceReadinessNumber[],
): number {
  return workspaceNumbers.filter(isVerifiedCallerIdNumber).length;
}

function isVerifiedCallerIdNumber(number: WorkspaceReadinessNumber): boolean {
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

function workspaceHasFirstNumber(
  workspaceNumbers: WorkspaceReadinessNumber[],
): boolean {
  return (
    countRentedWorkspaceNumbers(workspaceNumbers) > 0 ||
    countVerifiedCallerIdNumbers(workspaceNumbers) > 0
  );
}

export {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  isVerifiedCallerIdNumber,
  workspaceHasFirstNumber,
};

export type WorkspaceOnboardingChannelType = WorkspaceOnboardingChannel;
