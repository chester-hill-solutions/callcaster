/**
 * Workspace-related database functions
 */
import Twilio from "twilio";
import { PostgrestError, SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  WorkspaceData,
  WorkspaceNumbers,
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
import { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";
import { MemberRole } from "@/components/workspace/TeamMember";
import { env } from "../env.server";
import { logger } from "../logger.server";
import { json } from "@remix-run/node";
import { createStripeContact } from "./stripe.server";
import { AppError, ErrorCode } from "@/lib/errors.server";
import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  ensureWorkspaceTwilioBootstrap,
  syncWorkspaceTwilioBootstrapState,
} from "@/lib/twilio-bootstrap.server";
import {
  getConversationParticipantPhones,
  getConversationPhoneKey,
  isInboundMessageDirection,
  sortConversationSummaries,
  type ChatSortOption,
  type ConversationSummary,
} from "../chat-conversation-sort";

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

export async function getUserWorkspaces({
  supabaseClient,
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session == null) {
    return { data: null, error: "No user session found" };
  }

  const workspacesQuery = supabaseClient
    .from("workspace")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error }: { data: WorkspaceData; error: PostgrestError | null } =
    await workspacesQuery;

  if (error) {
    logger.error("Error on function getUserWorkspaces: ", error);
  }

  return { data, error };
}

export async function createKeys({
  workspace_id,
  sid,
  token,
}: {
  workspace_id: string;
  sid: string;
  token: string;
}): Promise<NewKeyInstance> {
  const twilio = new Twilio.Twilio(sid, token);
  try {
    const newKey = await twilio.newKeys.create({ friendlyName: workspace_id });
    return newKey;
  } catch (error) {
    logger.error("Error creating keys", error);
    throw error;
  }
}

export async function createSubaccount({
  workspace_id,
}: {
  workspace_id: string;
}) {
  const twilio = new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
  const account = await twilio.api.v2010.accounts
    .create({
      friendlyName: workspace_id,
    })
    .catch((error) => {
      logger.error("Error creating subaccount", error);
    });
  return account;
}

/** Twilio `AccountInstance` is not JSON-serializable (circular `_version`); tests may return plain objects without `toJSON`. */
function twilioAccountToPersistableJson(account: unknown): Record<string, unknown> {
  if (
    typeof account === "object" &&
    account !== null &&
    "toJSON" in account &&
    typeof (account as { toJSON?: unknown }).toJSON === "function"
  ) {
    const plain = (account as { toJSON: () => object }).toJSON();
    return { ...(plain as Record<string, unknown>) };
  }
  if (typeof account !== "object" || account === null) {
    return {};
  }
  const rec = account as Record<string, unknown>;
  const keys = [
    "authToken",
    "dateCreated",
    "dateUpdated",
    "friendlyName",
    "ownerAccountSid",
    "sid",
    "status",
    "subresourceUris",
    "type",
    "uri",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in rec && rec[k] !== undefined) {
      out[k] = rec[k];
    }
  }
  return out;
}

export async function createNewWorkspace({
  supabaseClient,
  workspaceName,
  user_id,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceName: string;
  user_id: string;
}) {
  try {
    const { data: insertWorkspaceData, error: insertWorkspaceError } =
      await supabaseClient.rpc("create_new_workspace", {
        new_workspace_name: workspaceName,
        user_id,
      });
    if (insertWorkspaceError) {
      throw insertWorkspaceError;
    }
    if (!insertWorkspaceData) {
      throw new Error("Workspace creation RPC returned no workspace id");
    }

    const account = await createSubaccount({
      workspace_id: insertWorkspaceData!,
    });

    if (!account) {
      throw new Error("Failed to create Twilio subaccount");
    }

    const newKey = await createKeys({
      workspace_id: insertWorkspaceData!,
      sid: account.sid,
      token: account.authToken,
    });
    if (!newKey) {
      throw new Error("Failed to create Twilio API keys");
    }

    const newStripeCustomer = await createStripeContact({
      supabaseClient,
      workspace_id: insertWorkspaceData!,
    });

    const seededOnboarding = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        subaccountBootstrap: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap,
          callbackBaseUrl: env.BASE_URL(),
          inboundVoiceUrl: `${env.BASE_URL()}/api/inbound`,
          inboundSmsUrl: `${env.BASE_URL()}/api/inbound-sms`,
          statusCallbackUrl: `${env.BASE_URL()}/api/caller-id/status`,
          status: "provisioning",
        },
        status: "provisioning",
        currentStep: "messaging_service",
        lastUpdatedBy: user_id,
      },
    );
    seededOnboarding.steps = buildOnboardingStepsForState(seededOnboarding);

    const { error: insertWorkspaceUsersError } = await supabaseClient
      .from("workspace")
      .update({
        twilio_data: {
          ...twilioAccountToPersistableJson(account),
          onboarding: seededOnboarding,
        } as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
        key: newKey.sid,
        token: newKey.secret,
        stripe_id: newStripeCustomer.id,
      })
      .eq("id", insertWorkspaceData!);
    if (insertWorkspaceUsersError) {
      throw insertWorkspaceUsersError;
    }

    try {
      await ensureWorkspaceTwilioBootstrap({
        supabaseClient,
        workspaceId: insertWorkspaceData!,
        actorUserId: user_id,
      });
    } catch (bootstrapError) {
      logger.error(
        "Workspace Twilio bootstrap failed after workspace creation:",
        bootstrapError,
      );
    }

    return { data: insertWorkspaceData, error: null };
  } catch (error) {
    logger.error("Error in createNewWorkspace:", error);
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

export async function getWorkspaceInfo({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string | undefined;
}) {
  if (workspaceId == null) return { error: "No workspace id" };

  const { data, error } = await supabaseClient
    .from("workspace")
    .select("name")
    .eq("id", workspaceId)
    .single();

  if (error) {
    logger.error(`Error on function getWorkspaceInfo: ${error.details}`);
  }

  return { data, error };
}

export type WorkspaceInfoWithDetails = {
  workspace: WorkspaceData & { workspace_users: { role: MemberRole }[] };
  workspace_users: { role: MemberRole }[];
  campaigns: unknown[];
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  audiences: unknown[];
};

export async function getWorkspaceInfoWithDetails({
  supabaseClient,
  workspaceId,
  userId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
}) {
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(
      `id, name, credits, 
        workspace_users(id, role), 
        campaign(*), 
        workspace_number(id, phone_number, capabilities), 
        audience(id, name)`,
    )
    .eq("id", workspaceId)
    .eq("workspace_users.user_id", userId)
    .single();
  if (workspaceError) throw workspaceError;
  const { campaign, workspace_number, audience, ...rest } = workspace;
  return {
    workspace: rest,
    campaigns: campaign,
    phoneNumbers: workspace_number,
    audiences: audience,
  } as unknown as WorkspaceInfoWithDetails;
}

export async function getWorkspaceUsers({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  if (error) {
    logger.error("Error on function getWorkspaceUsers", error);
  }

  return { data, error };
}

export async function getWorkspacePhoneNumbers({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace_number")
    .select()
    .eq(`workspace`, workspaceId);
  if (error) {
    logger.error("Error on function getWorkspacePhoneNumbers", error);
  }
  return { data, error };
}

/**
 * Returns the first handset-enabled number for the workspace, or the first voice-capable number.
 * Used by the handset page to show which number to call.
 */
export async function getHandsetNumberForWorkspace({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}): Promise<{
  data: { id: number; phone_number: string | null } | null;
  error: PostgrestError | null;
}> {
  const { data: handset } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number")
    .eq("workspace", workspaceId)
    .eq("handset_enabled", true)
    .limit(1)
    .maybeSingle();
  if (handset) return { data: handset, error: null };
  const { data: first } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number")
    .eq("workspace", workspaceId)
    .limit(1)
    .maybeSingle();
  return { data: first, error: null };
}

export async function updateWorkspacePhoneNumber({
  supabaseClient,
  workspaceId,
  numberId,
  updates,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  numberId: string | number;
  updates: Partial<NonNullable<WorkspaceNumbers>>;
}) {
  const { data, error } = await supabaseClient
    .from("workspace_number")
    .update(updates)
    .eq("id", Number(numberId))
    .eq("workspace", workspaceId)
    .select()
    .single();
  return { data, error };
}

export async function addUserToWorkspace({
  supabaseClient,
  workspaceId,
  userId,
  role,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "caller" | "member";
}) {
  const { data, error } = await supabaseClient
    .from("workspace_users")
    .insert({ workspace_id: workspaceId, user_id: userId, role })
    .select()
    .single();
  if (error) {
    logger.error("Failed to join workspace", error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function getUserRole({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient;
  user: { id: string } | null;
  workspaceId: string;
}) {
  if (!user) {
    return null;
  }

  const { data: userRole, error: userRoleError } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (userRoleError) {
    const errorCode = (userRoleError as { code?: string }).code;
    if (errorCode !== "PGRST116") {
      logger.error("Failed to load user role for workspace", {
        workspaceId,
        userId: user.id,
        code: errorCode,
        message: userRoleError.message,
      });
    }
  }

  return userRole;
}

/**
 * Verify that the user has access to the workspace. Throws AppError with 403 if not.
 * Use as defense-in-depth when workspace_id comes from request body.
 */
export async function requireWorkspaceAccess({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient;
  user: { id: string };
  workspaceId: string;
}): Promise<void> {
  const role = await getUserRole({
    supabaseClient,
    user,
    workspaceId,
  });
  if (!role || !["owner", "admin", "member", "caller"].includes(role.role)) {
    throw new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN);
  }
}

export async function updateUserWorkspaceAccessDate({
  workspaceId,
  supabaseClient,
}: {
  workspaceId: string;
  supabaseClient: SupabaseClient<Database>;
}): Promise<void> {
  const { data: updatedTime, error: updatedTimeError } =
    await supabaseClient.rpc("update_user_workspace_last_access_time", {
      selected_workspace_id: workspaceId,
    });

  if (updatedTimeError) {
    logger.error("Error updating user access time: ", updatedTimeError);
  }

  return;
}

export async function handleExistingUserSession(
  supabaseClient: SupabaseClient,
  serverSession: Session,
  headers: Headers,
) {
  const { data: invites, error: inviteError } = await supabaseClient
    .from("workspace_invite")
    .select()
    .eq("user_id", serverSession.user.id);
  if (inviteError)
    return json(
      { error: inviteError, newSession: null, invites: [] },
      { headers },
    );
  return json({ newSession: serverSession, invites, error: null }, { headers });
}

export async function handleNewUserOTPVerification(
  supabaseClient: SupabaseClient,
  token_hash: string,
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change",
  headers: Headers,
) {
  if (!token_hash) {
    return json({ error: "Invalid invitation link" }, { headers });
  }

  const { data, error } = await supabaseClient.auth.verifyOtp({
    token_hash,
    type: type as
      | "signup"
      | "invite"
      | "magiclink"
      | "recovery"
      | "email_change",
  });

  if (error) return json({ error }, { headers });

  const newSession = data.session;

  if (newSession) {
    const { error: sessionError } =
      await supabaseClient.auth.setSession(newSession);
    if (sessionError) return json({ error: sessionError }, { headers });

    const { data: invites, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("user_id", newSession.user.id);

    if (inviteError) return json({ error: inviteError }, { headers });

    return json({ newSession, invites }, { headers });
  } else {
    return json({ error: "Failed to create session" }, { headers });
  }
}

export async function createWorkspaceTwilioInstance({
  supabase,
  workspace_id,
}: {
  supabase: SupabaseClient;
  workspace_id: string;
}) {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
  return twilio;
}

export async function removeWorkspacePhoneNumber({
  supabaseClient,
  workspaceId,
  numberId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  numberId: bigint;
}) {
  const normalizedNumberId = Number(numberId);
  try {
    const { data: number, error: numberError } = await supabaseClient
      .from("workspace_number")
      .select()
      .eq("id", normalizedNumberId)
      .single();
    if (numberError) throw numberError;
    const twilio = await createWorkspaceTwilioInstance({
      supabase: supabaseClient,
      workspace_id: workspaceId,
    });
    if (!number.friendly_name) {
      throw new Error("Friendly name is required");
    }
    const outgoingIds = await twilio.outgoingCallerIds.list({
      friendlyName: number.friendly_name,
    });
    const incomingIds = await twilio.incomingPhoneNumbers.list({
      friendlyName: number.friendly_name,
    });
    await Promise.all([
      ...outgoingIds.map(async (id) => {
        return await twilio.outgoingCallerIds(id.sid).remove();
      }),
      ...incomingIds.map(async (id) => {
        return await twilio.incomingPhoneNumbers(id.sid).remove();
      }),
    ]);
    const { error: deletionError } = await supabaseClient
      .from("workspace_number")
      .delete()
      .eq("id", normalizedNumberId);

    if (deletionError) throw deletionError;
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function updateCallerId({
  supabaseClient,
  workspaceId,
  number,
  friendly_name,
}: {
  supabaseClient: SupabaseClient;
  workspaceId: string;
  number: WorkspaceNumbers;
  friendly_name: string;
}) {
  if (!number || !number.phone_number) return { error: null };
  try {
    const twilio = await createWorkspaceTwilioInstance({
      supabase: supabaseClient,
      workspace_id: workspaceId,
    });

    const [outgoingIds, incomingIds] = await Promise.all([
      twilio.outgoingCallerIds.list({ phoneNumber: number.phone_number }),
      twilio.incomingPhoneNumbers.list({ phoneNumber: number.phone_number }),
    ]);
    const updatedOutgoing = Promise.all(
      outgoingIds.map((id) =>
        twilio
          .outgoingCallerIds(id.sid)
          .update({ friendlyName: friendly_name }),
      ),
    );

    const updatedIncoming = Promise.all(
      incomingIds.map((id) =>
        twilio
          .incomingPhoneNumbers(id.sid)
          .update({ friendlyName: friendly_name }),
      ),
    );

    await Promise.all([updatedOutgoing, updatedIncoming]);
    return { error: null };
  } catch (error) {
    logger.error("Error updating caller ID", error);
    return { error };
  }
}

export async function fetchWorkspaceData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(`*, workspace_number(*)`)
    .eq("id", workspaceId)
    .eq("workspace_number.type", "rented")
    .single();

  return { workspace, workspaceError };
}

export async function getWorkspaceScripts({
  workspace,
  supabase,
}: {
  workspace: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("script")
    .select()
    .eq("workspace", workspace);
  if (error) logger.error("Error fetching scripts", error);
  return data;
}

export function getRecordingFileNames(stepData: unknown) {
  if (!Array.isArray(stepData)) {
    logger.warn("stepData is not an array");
    return [];
  }

  return stepData.reduce((fileNames: string[], step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return fileNames;
    }

    const typedStep = step as { speechType?: string; say?: string };
    if (
      typedStep.speechType === "recorded" &&
      typedStep.say &&
      typedStep.say !== "Enter your question here"
    ) {
      fileNames.push(typedStep.say);
    }
    return fileNames;
  }, []);
}

export async function getMedia(
  fileNames: Array<string>,
  supabaseClient: SupabaseClient,
  workspace_id: string,
) {
  const media = await Promise.all(
    fileNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return { [mediaName]: data.signedUrl };
    }),
  );

  return media;
}

export async function listMedia(
  supabaseClient: SupabaseClient,
  workspace: string,
) {
  const { data, error } = await supabaseClient.storage
    .from(`workspaceAudio`)
    .list(workspace);
  if (error) logger.error("Error listing workspace media", error);
  return data;
}

export async function getSignedUrls(
  supabaseClient: SupabaseClient,
  workspace_id: string,
  mediaNames: string[],
) {
  return Promise.all(
    mediaNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("messageMedia")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return data.signedUrl;
    }),
  );
}

export async function acceptWorkspaceInvitations(
  supabaseClient: SupabaseClient<Database>,
  invitationIds: string[],
  userId: string,
) {
  const errors: Array<{ invitationId: string; type: string }> = [];
  if (invitationIds.length === 0) {
    return { errors };
  }

  const { data: inviteRows, error: inviteQueryError } = await supabaseClient
    .from("workspace_invite")
    .select("id, workspace, role")
    .in("id", invitationIds);

  if (inviteQueryError) {
    return {
      errors: invitationIds.map((invitationId) => ({
        invitationId,
        type: "invite",
      })),
    };
  }

  const invitesById = new Map(
    (inviteRows ?? []).map((invite) => [String(invite.id), invite]),
  );

  const processableInvites = invitationIds
    .map((invitationId) => {
      const invite = invitesById.get(invitationId);
      if (!invite) {
        errors.push({ invitationId, type: "invite" });
        return null;
      }
      return { invitationId, invite };
    })
    .filter(
      (
        value,
      ): value is {
        invitationId: string;
        invite: {
          id: string;
          workspace: string;
          role: "owner" | "admin" | "caller" | "member";
        };
      } => value !== null,
    );

  const invitationResults = await Promise.all(
    processableInvites.map(async ({ invitationId, invite }) => {
      const invitationErrors: Array<{ invitationId: string; type: string }> =
        [];

      const { error: workspaceError } = await addUserToWorkspace({
        supabaseClient,
        workspaceId: invite.workspace,
        userId,
        role: invite.role,
      });
      if (workspaceError) {
        invitationErrors.push({ invitationId, type: "workspace" });
      }

      const { error: deletionError } = await supabaseClient
        .from("workspace_invite")
        .delete()
        .eq("id", invitationId);

      if (deletionError) {
        invitationErrors.push({ invitationId, type: "deletion" });
      }

      return invitationErrors;
    }),
  );

  for (const invitationErrors of invitationResults) {
    errors.push(...invitationErrors);
  }

  return { errors };
}

export async function getInvitesByUserId(
  supabase: SupabaseClient,
  user_id: string,
) {
  const { data, error } = await supabase
    .from("workspace_invite")
    .select()
    .eq("user_id", user_id);
  if (error) throw error;
  return data;
}

type FetchConversationSummaryOptions = {
  limit?: number;
  offset?: number;
  sort?: ChatSortOption;
};

type ConversationMessageRow = Pick<
  Database["public"]["Tables"]["message"]["Row"],
  | "body"
  | "campaign_id"
  | "contact_id"
  | "date_created"
  | "direction"
  | "from"
  | "status"
  | "to"
>;

type ContactNameRow = Pick<
  Database["public"]["Tables"]["contact"]["Row"],
  "firstname" | "id" | "phone" | "surname"
>;

type PhoneMatchedContactRow =
  Database["public"]["Functions"]["find_contact_by_phone"]["Returns"][number];

function compareConversationDates(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function contactMatchesConversationPhone(
  contact: ContactNameRow | undefined,
  contactPhone: string,
): contact is ContactNameRow {
  if (!contact?.phone) {
    return false;
  }

  return (
    getConversationPhoneKey(contact.phone) ===
    getConversationPhoneKey(contactPhone)
  );
}

function conversationNeedsPhoneMatchedContact(
  conversation: ConversationSummary,
): boolean {
  return !conversation.contact_firstname && !conversation.contact_surname;
}

/** Max messages to fetch when building conversation list; keeps contact/phone lookups bounded. */
const CONVERSATION_MESSAGE_CAP = 30_000;
const CONVERSATION_MESSAGE_PAGE_SIZE = 2_000;

const CONTACT_IDS_BATCH_SIZE = 800;
const PHONES_BATCH_SIZE = 800;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function fetchConversationSummary(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  campaign_id?: string | null,
  options: FetchConversationSummaryOptions = {},
) {
  const limit = Math.max(1, options.limit ?? 20);
  const offset = Math.max(0, options.offset ?? 0);
  const sort = options.sort ?? "recent";

  const { data: workspaceNumberRows, error: workspaceNumbersError } =
    await supabaseClient
      .from("workspace_number")
      .select("phone_number")
      .eq("workspace", workspaceId);

  if (workspaceNumbersError) {
    return { chats: [], chatsError: workspaceNumbersError, hasMore: false };
  }

  const workspacePhoneKeys = new Set(
    (workspaceNumberRows ?? [])
      .map((row) => getConversationPhoneKey(row.phone_number))
      .filter((phone): phone is string => Boolean(phone)),
  );

  const conversationMap = new Map<string, ConversationSummary>();
  const conversationContactIds = new Map<string, number>();
  const contactIds = new Set<number>();

  const numericCampaignId = campaign_id ? Number(campaign_id) : null;
  const shouldFilterByCampaign =
    numericCampaignId !== null && !Number.isNaN(numericCampaignId);

  let scannedMessages = 0;
  let cursor = 0;
  let hasMoreRows = true;

  while (hasMoreRows && scannedMessages < CONVERSATION_MESSAGE_CAP) {
    const pageStart = cursor;
    const pageLimit = Math.min(
      CONVERSATION_MESSAGE_PAGE_SIZE,
      CONVERSATION_MESSAGE_CAP - scannedMessages,
    );
    const pageEnd = pageStart + pageLimit - 1;

    let pageQuery = supabaseClient
      .from("message")
      .select(
        "body, campaign_id, contact_id, date_created, direction, from, status, to",
      )
      .eq("workspace", workspaceId)
      .not("date_created", "is", null)
      .neq("status", "failed")
      .order("date_created", { ascending: false })
      .range(pageStart, pageEnd);

    if (shouldFilterByCampaign) {
      pageQuery = pageQuery.eq("campaign_id", numericCampaignId as number);
    }

    const { data: pageRows, error: messagesError } = await pageQuery;
    if (messagesError) {
      return { chats: [], chatsError: messagesError, hasMore: false };
    }

    const typedRows = (pageRows ?? []) as ConversationMessageRow[];
    if (typedRows.length === 0) {
      hasMoreRows = false;
      continue;
    }

    scannedMessages += typedRows.length;
    cursor += typedRows.length;
    hasMoreRows = typedRows.length === pageLimit;

    for (const message of typedRows) {
      if (typeof message.contact_id === "number") {
        contactIds.add(message.contact_id);
      }

      const { contactPhone, userPhone } = getConversationParticipantPhones(
        message,
        workspacePhoneKeys,
      );
      const conversationKey = getConversationPhoneKey(contactPhone);
      const timestamp = message.date_created ?? new Date().toISOString();

      if (!contactPhone || !conversationKey) {
        continue;
      }

      if (
        typeof message.contact_id === "number" &&
        !conversationContactIds.has(conversationKey)
      ) {
        // Rows are scanned newest-first, so the first contact_id per conversation
        // is the strongest candidate and keeps contact lookups bounded.
        conversationContactIds.set(conversationKey, message.contact_id);
      }

      const existingConversation = conversationMap.get(conversationKey);
      const hasReplied = isInboundMessageDirection(message.direction);
      const unreadIncrement =
        isInboundMessageDirection(message.direction) && message.status === "received"
          ? 1
          : 0;

      if (!existingConversation) {
        conversationMap.set(conversationKey, {
          contact_phone: contactPhone,
          user_phone: userPhone ?? "",
          conversation_start: timestamp,
          conversation_last_update: timestamp,
          message_count: 1,
          unread_count: unreadIncrement,
          contact_firstname: null,
          contact_surname: null,
          has_replied: hasReplied,
          last_inbound_body:
            hasReplied && message.body != null ? message.body : null,
        });
        continue;
      }

      existingConversation.message_count += 1;
      existingConversation.unread_count += unreadIncrement;
      existingConversation.has_replied =
        existingConversation.has_replied === true || hasReplied;
      if (
        existingConversation.last_inbound_body == null &&
        hasReplied &&
        message.body != null
      ) {
        existingConversation.last_inbound_body = message.body;
      }

      if (
        compareConversationDates(
          existingConversation.conversation_start,
          timestamp,
        ) > 0
      ) {
        existingConversation.conversation_start = timestamp;
      }

      if (
        compareConversationDates(
          existingConversation.conversation_last_update,
          timestamp,
        ) < 0
      ) {
        existingConversation.conversation_last_update = timestamp;
      }

      if (!existingConversation.user_phone && userPhone) {
        existingConversation.user_phone = userPhone;
      }

      if (!existingConversation.contact_phone && contactPhone) {
        existingConversation.contact_phone = contactPhone;
      }
    }
  }

  const contactsById = new Map<number, ContactNameRow>();
  if (contactIds.size > 0) {
    const batches = chunk(Array.from(contactIds), CONTACT_IDS_BATCH_SIZE);
    const batchResults = await Promise.all(
      batches.map((ids) =>
        supabaseClient
          .from("contact")
          .select("firstname, id, phone, surname")
          .eq("workspace", workspaceId)
          .in("id", ids),
      ),
    );
    for (const { data: contactRows, error: contactsError } of batchResults) {
      if (contactsError) {
        logger.error("Error loading contact names for conversations", {
          message: contactsError.message,
          code: (contactsError as { code?: string }).code,
          details: (contactsError as { details?: string }).details,
          contactIdsCount: contactIds.size,
        });
      } else if (contactRows?.length) {
        for (const contact of contactRows) {
          contactsById.set(contact.id, contact);
        }
      }
    }
  }

  for (const [conversationKey, conversation] of conversationMap.entries()) {
    const candidateContactId = conversationContactIds.get(conversationKey);
    if (typeof candidateContactId !== "number") {
      continue;
    }

    const candidateContact = contactsById.get(candidateContactId);
    if (
      !contactMatchesConversationPhone(
        candidateContact,
        conversation.contact_phone,
      )
    ) {
      continue;
    }

    if (!conversation.contact_firstname && candidateContact.firstname) {
      conversation.contact_firstname = candidateContact.firstname;
    }

    if (!conversation.contact_surname && candidateContact.surname) {
      conversation.contact_surname = candidateContact.surname;
    }
  }

  if (typeof supabaseClient.rpc === "function") {
    const phonesMissingNames = Array.from(
      new Set(
        Array.from(conversationMap.values())
          .filter((conversation) =>
            conversationNeedsPhoneMatchedContact(conversation),
          )
          .map((conversation) => conversation.contact_phone)
          .filter((phone): phone is string => Boolean(phone)),
      ),
    );

    if (phonesMissingNames.length > 0) {
      const phoneMatchedContacts = new Map<string, PhoneMatchedContactRow>();
      const phoneBatches = chunk(phonesMissingNames, PHONES_BATCH_SIZE);
      const rpcResults = await Promise.all(
        phoneBatches.map((phones) =>
          supabaseClient.rpc("find_contacts_by_phones", {
            p_workspace_id: workspaceId,
            p_phone_numbers: phones,
          }),
        ),
      );
      for (const { data, error } of rpcResults) {
        if (error) {
          logger.error("Error loading contacts by phones for conversations", {
            error,
            workspaceId,
            phoneCount: phonesMissingNames.length,
          });
        } else if (data?.length) {
          for (const row of data) {
            const key = getConversationPhoneKey(row.phone) ?? row.phone;
            if (key) phoneMatchedContacts.set(key, row);
          }
        }
      }

      for (const conversation of conversationMap.values()) {
        if (!conversationNeedsPhoneMatchedContact(conversation)) {
          continue;
        }

        const lookupKey =
          getConversationPhoneKey(conversation.contact_phone) ??
          conversation.contact_phone;
        const matchedContact = lookupKey
          ? phoneMatchedContacts.get(lookupKey)
          : undefined;
        if (!matchedContact) {
          continue;
        }

        conversation.contact_firstname = matchedContact.firstname;
        conversation.contact_surname = matchedContact.surname;
      }
    }
  }

  const filteredAndSortedChats = sortConversationSummaries(
    Array.from(conversationMap.values()),
    sort,
  );
  const paginatedChats = filteredAndSortedChats.slice(offset, offset + limit + 1);
  const hasMore = paginatedChats.length > limit;

  return {
    chats: hasMore ? paginatedChats.slice(0, limit) : paginatedChats,
    chatsError: null,
    hasMore,
  };
}
