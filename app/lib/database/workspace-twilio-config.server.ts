import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  type TwilioAccountData,
  type TwilioMessageIntent,
  TWILIO_MESSAGE_INTENT_VALUES,
  TWILIO_MULTI_TENANCY_MODE_VALUES,
  TWILIO_ONBOARDING_STATUS_VALUES,
  TWILIO_SEND_MODE_VALUES,
  TWILIO_SMS_SENDER_CLASS_VALUES,
  TWILIO_THROUGHPUT_PRODUCT_VALUES,
  TWILIO_TRAFFIC_CLASS_VALUES,
  type TwilioSmsSenderClass,
  type WorkspaceTwilioOpsAuditEntry,
  type WorkspaceTwilioOpsConfig,
} from "../types";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import {
  defaultSmsTargetMps,
  defaultVoiceConcurrentCallLimit,
  defaultVoiceTargetCps,
} from "@/lib/throughput-config.server";
import { isRecord, parseOptionalString } from "@/lib/parse-utils.server";

export const DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG: WorkspaceTwilioOpsConfig = {
  trafficClass: "unknown",
  throughputProduct: "none",
  multiTenancyMode: "none",
  trafficShapingEnabled: false,
  defaultMessageIntent: null,
  sendMode: "from_number",
  messagingServiceSid: null,
  onboardingStatus: "not_started",
  smsSenderClass: "unknown",
  smsTargetMps: 1,
  voiceTargetCps: 1,
  voiceConcurrentCallLimit: 100,
  parallelDispatchEnabled: false,
  supportNotes: "",
  updatedAt: null,
  updatedBy: null,
  auditTrail: [],
};

function pickEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowedValues.includes(value)
    ? value
    : fallback;
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

  const smsSenderClass = pickEnumValue(
    value.smsSenderClass,
    TWILIO_SMS_SENDER_CLASS_VALUES,
    DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.smsSenderClass,
  );

  const smsTargetMps =
    typeof value.smsTargetMps === "number" &&
    Number.isFinite(value.smsTargetMps) &&
    value.smsTargetMps > 0
      ? value.smsTargetMps
      : defaultSmsTargetMps(smsSenderClass);

  const voiceTargetCps =
    typeof value.voiceTargetCps === "number" &&
    Number.isFinite(value.voiceTargetCps) &&
    value.voiceTargetCps > 0
      ? value.voiceTargetCps
      : defaultVoiceTargetCps();

  const voiceConcurrentCallLimit =
    typeof value.voiceConcurrentCallLimit === "number" &&
    Number.isFinite(value.voiceConcurrentCallLimit) &&
    value.voiceConcurrentCallLimit > 0
      ? Math.floor(value.voiceConcurrentCallLimit)
      : defaultVoiceConcurrentCallLimit();

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
    smsSenderClass,
    smsTargetMps,
    voiceTargetCps,
    voiceConcurrentCallLimit,
    parallelDispatchEnabled:
      typeof value.parallelDispatchEnabled === "boolean"
        ? value.parallelDispatchEnabled
        : DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.parallelDispatchEnabled,
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

  return normalizeWorkspaceTwilioOpsConfig(twilioData.portalConfig);
}

export function getEffectiveWorkspaceTwilioPortalConfig(
  twilioData: TwilioAccountData,
): WorkspaceTwilioOpsConfig {
  if (!twilioData || !isRecord(twilioData)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG };
  }

  const config = getWorkspaceTwilioPortalConfigFromTwilioData(twilioData);
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
  if (currentConfig.defaultMessageIntent !== nextConfig.defaultMessageIntent) {
    changedFields.push("default MessageIntent");
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
  if (currentConfig.smsSenderClass !== nextConfig.smsSenderClass) {
    changedFields.push(`SMS sender class to ${nextConfig.smsSenderClass}`);
  }
  if (currentConfig.smsTargetMps !== nextConfig.smsTargetMps) {
    changedFields.push(`SMS target MPS to ${nextConfig.smsTargetMps}`);
  }
  if (currentConfig.voiceTargetCps !== nextConfig.voiceTargetCps) {
    changedFields.push(`voice target CPS to ${nextConfig.voiceTargetCps}`);
  }
  if (
    currentConfig.voiceConcurrentCallLimit !==
    nextConfig.voiceConcurrentCallLimit
  ) {
    changedFields.push("voice concurrent call limit");
  }
  if (
    currentConfig.parallelDispatchEnabled !== nextConfig.parallelDispatchEnabled
  ) {
    changedFields.push(
      nextConfig.parallelDispatchEnabled
        ? "enabled parallel dispatch"
        : "disabled parallel dispatch",
    );
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
    sendMode: currentConfig.sendMode,
    messagingServiceSid: currentConfig.messagingServiceSid,
    onboardingStatus: currentConfig.onboardingStatus,
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
