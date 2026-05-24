/**
 * Workspace Twilio portal and sync database functions
 */
import Twilio from "twilio";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  type TwilioAccountData,
  type TwilioMessageIntent,
  TWILIO_MESSAGE_INTENT_VALUES,
  TWILIO_MULTI_TENANCY_MODE_VALUES,
  TWILIO_ONBOARDING_STATUS_VALUES,
  TWILIO_SEND_MODE_VALUES,
  TWILIO_THROUGHPUT_PRODUCT_VALUES,
  TWILIO_TRAFFIC_CLASS_VALUES,
  type TwilioTrafficClass,
  type WorkspaceTwilioOpsAuditEntry,
  type WorkspaceTwilioOpsConfig,
  type WorkspaceTwilioPortalMetrics,
  type WorkspaceTwilioPortalRecommendation,
  type WorkspaceTwilioSyncSnapshot,
} from "../types";
import { logger } from "../logger.server";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import { syncWorkspaceTwilioBootstrapState } from "@/lib/twilio-bootstrap.server";

async function syncWorkspaceTwilioBootstrapStateSafely(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  try {
    await syncWorkspaceTwilioBootstrapState(args);
  } catch (error) {
    logger.error("Failed to sync workspace Twilio bootstrap state:", {
      workspaceId: args.workspaceId,
      error,
    });
  }
}

const DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG: WorkspaceTwilioOpsConfig = {
  trafficClass: "unknown",
  throughputProduct: "none",
  multiTenancyMode: "none",
  trafficShapingEnabled: false,
  defaultMessageIntent: null,
  sendMode: "from_number",
  messagingServiceSid: null,
  onboardingStatus: "not_started",
  supportNotes: "",
  updatedAt: null,
  updatedBy: null,
  auditTrail: [],
};

const DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT: WorkspaceTwilioSyncSnapshot = {
  accountStatus: null,
  accountFriendlyName: null,
  phoneNumberCount: 0,
  numberTypes: [],
  recentUsageCount: 0,
  usageTotalPrice: null,
  lastSyncedAt: null,
  lastSyncStatus: "never_synced",
  lastSyncError: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowedValues.includes(value)
    ? value
    : fallback;
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAuditTrail(value: unknown): WorkspaceTwilioOpsAuditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => ({
      changedAt:
        typeof entry.changedAt === "string"
          ? entry.changedAt
          : new Date(0).toISOString(),
      actorUserId:
        typeof entry.actorUserId === "string" ? entry.actorUserId : null,
      actorUsername:
        typeof entry.actorUsername === "string" ? entry.actorUsername : null,
      summary:
        typeof entry.summary === "string"
          ? entry.summary
          : "Saved Twilio portal settings",
    }))
    .slice(0, 10);
}

function mapOnboardingStateToPortalStatus(
  onboardingStatus: ReturnType<
    typeof getWorkspaceMessagingOnboardingFromTwilioData
  >["status"],
): WorkspaceTwilioOpsConfig["onboardingStatus"] {
  switch (onboardingStatus) {
    case "approved":
    case "live":
      return "enabled";
    case "provisioning":
    case "submitting":
    case "in_review":
      return "requested";
    case "collecting_business":
      return "planned";
    case "not_started":
    case "rejected":
      return "not_started";
    default: {
      const exhaustiveCheck: never = onboardingStatus;
      return exhaustiveCheck;
    }
  }
}

export function normalizeWorkspaceTwilioOpsConfig(
  value: unknown,
): WorkspaceTwilioOpsConfig {
  if (!isRecord(value)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG };
  }

  const defaultMessageIntent =
    typeof value.defaultMessageIntent === "string" &&
    TWILIO_MESSAGE_INTENT_VALUES.includes(
      value.defaultMessageIntent as TwilioMessageIntent,
    )
      ? (value.defaultMessageIntent as TwilioMessageIntent)
      : null;

  return {
    trafficClass: pickEnumValue(
      value.trafficClass,
      TWILIO_TRAFFIC_CLASS_VALUES,
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.trafficClass,
    ),
    throughputProduct: pickEnumValue(
      value.throughputProduct,
      TWILIO_THROUGHPUT_PRODUCT_VALUES,
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.throughputProduct,
    ),
    multiTenancyMode: pickEnumValue(
      value.multiTenancyMode,
      TWILIO_MULTI_TENANCY_MODE_VALUES,
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.multiTenancyMode,
    ),
    trafficShapingEnabled:
      typeof value.trafficShapingEnabled === "boolean"
        ? value.trafficShapingEnabled
        : DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.trafficShapingEnabled,
    defaultMessageIntent,
    sendMode: pickEnumValue(
      value.sendMode,
      TWILIO_SEND_MODE_VALUES,
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.sendMode,
    ),
    messagingServiceSid: parseOptionalString(value.messagingServiceSid),
    onboardingStatus: pickEnumValue(
      value.onboardingStatus,
      TWILIO_ONBOARDING_STATUS_VALUES,
      DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.onboardingStatus,
    ),
    supportNotes:
      typeof value.supportNotes === "string" ? value.supportNotes : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : null,
    auditTrail: parseAuditTrail(value.auditTrail),
  };
}

export function getWorkspaceTwilioPortalConfigFromTwilioData(
  twilioData: TwilioAccountData,
): WorkspaceTwilioOpsConfig {
  if (!twilioData || !isRecord(twilioData)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG };
  }

  const config = normalizeWorkspaceTwilioOpsConfig(twilioData.portalConfig);
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  return normalizeWorkspaceTwilioOpsConfig({
    ...config,
    sendMode:
      onboarding.messagingService.desiredSendMode === "messaging_service"
        ? "messaging_service"
        : config.sendMode,
    messagingServiceSid:
      onboarding.messagingService.serviceSid ?? config.messagingServiceSid,
    onboardingStatus: mapOnboardingStateToPortalStatus(onboarding.status),
    trafficClass:
      onboarding.selectedChannels.includes("a2p10dlc") &&
      config.trafficClass === "unknown"
        ? "a2p10dlc"
        : config.trafficClass,
  });
}

export function normalizeWorkspaceTwilioSyncSnapshot(
  value: unknown,
): WorkspaceTwilioSyncSnapshot {
  if (!isRecord(value)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT };
  }

  const lastSyncStatus =
    value.lastSyncStatus === "syncing" ||
    value.lastSyncStatus === "healthy" ||
    value.lastSyncStatus === "error" ||
    value.lastSyncStatus === "never_synced"
      ? value.lastSyncStatus
      : DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT.lastSyncStatus;

  return {
    accountStatus: parseOptionalString(value.accountStatus),
    accountFriendlyName: parseOptionalString(value.accountFriendlyName),
    phoneNumberCount:
      typeof value.phoneNumberCount === "number" ? value.phoneNumberCount : 0,
    numberTypes: Array.isArray(value.numberTypes)
      ? value.numberTypes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    recentUsageCount:
      typeof value.recentUsageCount === "number" ? value.recentUsageCount : 0,
    usageTotalPrice:
      typeof value.usageTotalPrice === "number" ? value.usageTotalPrice : null,
    lastSyncedAt: parseOptionalString(value.lastSyncedAt),
    lastSyncStatus,
    lastSyncError: parseOptionalString(value.lastSyncError),
  };
}

export function getWorkspaceTwilioSyncSnapshotFromTwilioData(
  twilioData: TwilioAccountData,
): WorkspaceTwilioSyncSnapshot {
  if (!twilioData || !isRecord(twilioData)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT };
  }

  return normalizeWorkspaceTwilioSyncSnapshot(twilioData.portalSync);
}

export function detectTwilioTrafficClass(
  numberTypes: string[],
): TwilioTrafficClass {
  const normalizedTypes = numberTypes.map((value) => value.toLowerCase());

  if (normalizedTypes.some((value) => value.includes("short"))) {
    return "short_code";
  }
  if (normalizedTypes.some((value) => value.includes("toll"))) {
    return "toll_free";
  }
  if (normalizedTypes.some((value) => value.includes("alpha"))) {
    return "alphanumeric";
  }
  if (normalizedTypes.some((value) => value.includes("international"))) {
    return "international_long_code";
  }
  if (
    normalizedTypes.some(
      (value) =>
        value.includes("10dlc") ||
        value.includes("local") ||
        value.includes("mobile") ||
        value.includes("long"),
    )
  ) {
    return "a2p10dlc";
  }

  return "unknown";
}

function buildTwilioPortalAuditSummary(
  currentConfig: WorkspaceTwilioOpsConfig,
  nextConfig: WorkspaceTwilioOpsConfig,
): string {
  const changedFields: string[] = [];

  if (currentConfig.trafficClass !== nextConfig.trafficClass) {
    changedFields.push(`traffic class to ${nextConfig.trafficClass}`);
  }
  if (currentConfig.throughputProduct !== nextConfig.throughputProduct) {
    changedFields.push(`throughput product to ${nextConfig.throughputProduct}`);
  }
  if (currentConfig.multiTenancyMode !== nextConfig.multiTenancyMode) {
    changedFields.push(`multi-tenancy to ${nextConfig.multiTenancyMode}`);
  }
  if (currentConfig.sendMode !== nextConfig.sendMode) {
    changedFields.push(`send mode to ${nextConfig.sendMode}`);
  }
  if (currentConfig.messagingServiceSid !== nextConfig.messagingServiceSid) {
    changedFields.push("messaging service SID");
  }
  if (currentConfig.defaultMessageIntent !== nextConfig.defaultMessageIntent) {
    changedFields.push("default MessageIntent");
  }
  if (currentConfig.onboardingStatus !== nextConfig.onboardingStatus) {
    changedFields.push(`onboarding status to ${nextConfig.onboardingStatus}`);
  }
  if (
    currentConfig.trafficShapingEnabled !== nextConfig.trafficShapingEnabled
  ) {
    changedFields.push(
      nextConfig.trafficShapingEnabled
        ? "enabled traffic shaping"
        : "disabled traffic shaping",
    );
  }
  if (currentConfig.supportNotes !== nextConfig.supportNotes) {
    changedFields.push("support notes");
  }

  if (changedFields.length === 0) {
    return "Saved Twilio portal settings";
  }

  return `Updated ${changedFields.join(", ")}`;
}

export async function getWorkspaceTwilioPortalConfig({
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

  return getWorkspaceTwilioPortalConfigFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );
}

export async function updateWorkspaceTwilioPortalConfig({
  supabaseClient,
  workspaceId,
  updates,
  actorUserId,
  actorUsername,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  updates: Partial<WorkspaceTwilioOpsConfig>;
  actorUserId: string | null;
  actorUsername: string | null;
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
  const currentConfig = getWorkspaceTwilioPortalConfigFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );

  const mergedConfig = normalizeWorkspaceTwilioOpsConfig({
    ...currentConfig,
    ...updates,
    auditTrail: currentConfig.auditTrail,
    updatedAt: currentConfig.updatedAt,
    updatedBy: currentConfig.updatedBy,
  });

  const changedAt = new Date().toISOString();
  const auditEntry: WorkspaceTwilioOpsAuditEntry = {
    changedAt,
    actorUserId,
    actorUsername,
    summary: buildTwilioPortalAuditSummary(currentConfig, mergedConfig),
  };

  const nextConfig: WorkspaceTwilioOpsConfig = {
    ...mergedConfig,
    updatedAt: changedAt,
    updatedBy: actorUserId,
    auditTrail: [auditEntry, ...currentConfig.auditTrail].slice(0, 10),
  };

  const nextTwilioData = {
    ...currentTwilioData,
    portalConfig: nextConfig,
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

  return nextConfig;
}

export async function updateWorkspaceTwilioSyncSnapshot({
  supabaseClient,
  workspaceId,
  snapshot,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  snapshot: WorkspaceTwilioSyncSnapshot;
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
  const nextTwilioData = {
    ...currentTwilioData,
    portalSync: normalizeWorkspaceTwilioSyncSnapshot(snapshot),
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

  return normalizeWorkspaceTwilioSyncSnapshot(snapshot);
}

export async function syncWorkspaceTwilioSnapshot({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const twilioData = isRecord(workspace?.twilio_data)
    ? workspace.twilio_data
    : {};
  const sid = typeof twilioData.sid === "string" ? twilioData.sid : null;
  const authToken =
    typeof twilioData.authToken === "string" ? twilioData.authToken : null;

  if (!sid || !authToken) {
    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      supabaseClient,
      workspaceId,
      snapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 0,
        numberTypes: [],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError: "Missing workspace Twilio credentials",
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      supabaseClient,
      workspaceId,
    });
    return snapshot;
  }

  try {
    const twilio = new Twilio.Twilio(sid, authToken);
    const [account, numbers, usageRecords] = await Promise.all([
      twilio.api.v2010.accounts(sid).fetch(),
      twilio.incomingPhoneNumbers.list({ limit: 200 }),
      twilio.usage.records.list(),
    ]);

    const numberTypes = Array.from(
      new Set(
        numbers.flatMap((number) => {
          const detectedTypes: string[] = [];
          if (number.capabilities.sms) detectedTypes.push("sms");
          if (number.capabilities.mms) detectedTypes.push("mms");
          if (number.capabilities.voice) detectedTypes.push("voice");
          return detectedTypes;
        }),
      ),
    );

    const usageTotalPrice = usageRecords.reduce((sum, record) => {
      const price = Number(record.price ?? 0);
      return Number.isFinite(price) ? sum + price : sum;
    }, 0);

    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      supabaseClient,
      workspaceId,
      snapshot: {
        accountStatus: account.status,
        accountFriendlyName: account.friendlyName,
        phoneNumberCount: numbers.length,
        numberTypes,
        recentUsageCount: usageRecords.length,
        usageTotalPrice,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "healthy",
        lastSyncError: null,
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      supabaseClient,
      workspaceId,
    });
    return snapshot;
  } catch (syncError) {
    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      supabaseClient,
      workspaceId,
      snapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 0,
        numberTypes: [],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError:
          syncError instanceof Error
            ? syncError.message
            : "Unknown Twilio sync failure",
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      supabaseClient,
      workspaceId,
    });
    return snapshot;
  }
}

function buildTwilioPortalRecommendations({
  config,
  detectedTrafficClass,
  metrics,
}: {
  config: WorkspaceTwilioOpsConfig;
  detectedTrafficClass: TwilioTrafficClass;
  metrics: WorkspaceTwilioPortalMetrics;
}): WorkspaceTwilioPortalRecommendation[] {
  const recommendations: WorkspaceTwilioPortalRecommendation[] = [];

  if (
    config.trafficClass === "a2p10dlc" &&
    config.throughputProduct !== "none"
  ) {
    recommendations.push({
      severity: "warning",
      message:
        "US/Canada A2P 10DLC traffic is carrier-capped, so parent-account throughput products will not raise campaign MPS.",
    });
  }

  if (config.sendMode === "messaging_service" && !config.messagingServiceSid) {
    recommendations.push({
      severity: "warning",
      message:
        "This workspace is set to Messaging Service mode, but no Messaging Service SID is configured.",
    });
  }

  if (config.trafficShapingEnabled && !config.defaultMessageIntent) {
    recommendations.push({
      severity: "warning",
      message:
        "Traffic Shaping is enabled, but no default MessageIntent is configured, so messages will not be prioritized unless callers override it.",
    });
  }

  if (config.trafficClass === "unknown" && detectedTrafficClass !== "unknown") {
    recommendations.push({
      severity: "info",
      message: `Workspace phone numbers suggest ${detectedTrafficClass} traffic. Update the saved traffic class if that matches current operations.`,
    });
  }

  if (
    detectedTrafficClass !== "a2p10dlc" &&
    detectedTrafficClass !== "unknown" &&
    config.throughputProduct === "none"
  ) {
    recommendations.push({
      severity: "info",
      message:
        "This sender mix is eligible for parent-account throughput controls. Consider Market Throughput or Account Based Throughput plus Multi-Tenancy.",
    });
  }

  if (
    metrics.recentOutboundCount > 0 &&
    metrics.rawFromCount === metrics.recentOutboundCount
  ) {
    recommendations.push({
      severity: "info",
      message:
        "Recent outbound traffic is using raw From numbers only. Messaging Services can help with sender pooling and throughput operations.",
    });
  }

  return recommendations;
}

export async function getWorkspaceTwilioPortalSnapshot({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const [
    { data: workspace, error: workspaceError },
    { data: workspaceNumbers, error: numbersError },
    { data: recentMessages, error: messagesError },
  ] = await Promise.all([
    supabaseClient
      .from("workspace")
      .select("name, twilio_data")
      .eq("id", workspaceId)
      .single(),
    supabaseClient
      .from("workspace_number")
      .select("type, phone_number, capabilities")
      .eq("workspace", workspaceId),
    supabaseClient
      .from("message")
      .select("status, messaging_service_sid")
      .eq("workspace", workspaceId)
      .eq("direction", "outbound-api")
      .order("date_created", { ascending: false })
      .limit(200),
  ]);

  if (workspaceError) {
    throw workspaceError;
  }
  if (numbersError) {
    throw numbersError;
  }
  if (messagesError) {
    throw messagesError;
  }

  const config = getWorkspaceTwilioPortalConfigFromTwilioData(
    (workspace?.twilio_data ?? null) as TwilioAccountData,
  );
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(
    (workspace?.twilio_data ?? null) as TwilioAccountData,
  );
  const syncSnapshot = getWorkspaceTwilioSyncSnapshotFromTwilioData(
    (workspace?.twilio_data ?? null) as TwilioAccountData,
  );
  const numberTypes = (workspaceNumbers ?? [])
    .map((number) => number.type)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  const detectedTrafficClass = detectTwilioTrafficClass(numberTypes);
  const statusCounts = (recentMessages ?? []).reduce<
    WorkspaceTwilioPortalMetrics["statusCounts"]
  >((acc, message) => {
    if (message.status) {
      acc[message.status] = (acc[message.status] ?? 0) + 1;
    }
    return acc;
  }, {});

  const metrics: WorkspaceTwilioPortalMetrics = {
    recentOutboundCount: recentMessages?.length ?? 0,
    rawFromCount: (recentMessages ?? []).filter(
      (message) => !message.messaging_service_sid,
    ).length,
    messagingServiceCount: (recentMessages ?? []).filter(
      (message) => !!message.messaging_service_sid,
    ).length,
    statusCounts,
    numberTypes,
  };

  const recommendations = buildTwilioPortalRecommendations({
    config,
    detectedTrafficClass,
    metrics,
  });
  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding,
    workspaceNumbers: (workspaceNumbers ?? []).map((number) => ({
      type: number.type,
      phone_number: number.phone_number,
      capabilities: number.capabilities,
    })),
    recentOutboundCount: metrics.recentOutboundCount,
  });

  if (readiness.shouldShowOnboardingBanner) {
    recommendations.push(
      ...readiness.warnings.map((message) => ({
        severity: "warning" as const,
        message,
      })),
    );
  }

  const supportRequestSummary = [
    `Workspace: ${workspace?.name ?? workspaceId}`,
    `Traffic class: ${config.trafficClass}`,
    `Detected sender types: ${numberTypes.length ? numberTypes.join(", ") : "none detected"}`,
    `Throughput product: ${config.throughputProduct}`,
    `Multi-tenancy: ${config.multiTenancyMode}`,
    `Traffic shaping: ${config.trafficShapingEnabled ? "enabled" : "disabled"}`,
    `Default MessageIntent: ${config.defaultMessageIntent ?? "none"}`,
    `Send mode: ${config.sendMode}`,
    `Messaging Service SID: ${config.messagingServiceSid ?? "not configured"}`,
    `Recent outbound messages: ${metrics.recentOutboundCount}`,
    `Recent messaging-service sends: ${metrics.messagingServiceCount}`,
    `Recent raw-from sends: ${metrics.rawFromCount}`,
    `Messaging ready: ${readiness.messagingReady ? "yes" : "no"}`,
    `Voice ready: ${readiness.voiceReady ? "yes" : "no"}`,
    `Support notes: ${config.supportNotes || "none"}`,
  ].join("\n");

  return {
    config,
    onboarding,
    readiness,
    detectedTrafficClass,
    metrics,
    recommendations,
    supportRequestSummary,
    syncSnapshot,
  };
}
