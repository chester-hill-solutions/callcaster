import {
  normalizePortalThroughputConfig,
  type WorkspaceThroughputPortalConfig,
} from "./throughput-portal-config.ts";

export const TWILIO_MESSAGE_INTENTS = new Set([
  "otp",
  "notifications",
  "fraud",
  "security",
  "customercare",
  "delivery",
  "education",
  "events",
  "polling",
  "announcements",
  "marketing",
]);

export type WorkspaceTwilioOpsConfig = {
  trafficClass: string;
  throughputProduct: string;
  multiTenancyMode: string;
  trafficShapingEnabled: boolean;
  defaultMessageIntent: string | null;
  sendMode: "from_number" | "messaging_service";
  messagingServiceSid: string | null;
  onboardingStatus: string;
  smsSenderClass: WorkspaceThroughputPortalConfig["smsSenderClass"];
  smsTargetMps: number;
  voiceTargetCps: number;
  voiceConcurrentCallLimit: number;
  parallelDispatchEnabled: boolean;
  supportNotes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  auditTrail: Array<{
    changedAt: string;
    actorUserId: string | null;
    actorUsername: string | null;
    summary: string;
  }>;
};

const DEFAULT_THROUGHPUT = normalizePortalThroughputConfig(null);

const DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG: WorkspaceTwilioOpsConfig = {
  trafficClass: "unknown",
  throughputProduct: "none",
  multiTenancyMode: "none",
  trafficShapingEnabled: false,
  defaultMessageIntent: null,
  sendMode: "from_number",
  messagingServiceSid: null,
  onboardingStatus: "not_started",
  smsSenderClass: DEFAULT_THROUGHPUT.smsSenderClass,
  smsTargetMps: DEFAULT_THROUGHPUT.smsTargetMps,
  voiceTargetCps: DEFAULT_THROUGHPUT.voiceTargetCps,
  voiceConcurrentCallLimit: DEFAULT_THROUGHPUT.voiceConcurrentCallLimit,
  parallelDispatchEnabled: DEFAULT_THROUGHPUT.parallelDispatchEnabled,
  supportNotes: "",
  updatedAt: null,
  updatedBy: null,
  auditTrail: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePortalOpsConfig(value: unknown): WorkspaceTwilioOpsConfig {
  if (!isRecord(value)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG };
  }

  const defaultMessageIntent =
    typeof value.defaultMessageIntent === "string" &&
    TWILIO_MESSAGE_INTENTS.has(value.defaultMessageIntent)
      ? value.defaultMessageIntent
      : null;

  const throughput = normalizePortalThroughputConfig({ portalConfig: value });

  return {
    ...DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG,
    trafficClass: typeof value.trafficClass === "string" ? value.trafficClass : "unknown",
    throughputProduct:
      typeof value.throughputProduct === "string" ? value.throughputProduct : "none",
    multiTenancyMode:
      typeof value.multiTenancyMode === "string" ? value.multiTenancyMode : "none",
    trafficShapingEnabled:
      typeof value.trafficShapingEnabled === "boolean" ? value.trafficShapingEnabled : false,
    defaultMessageIntent,
    sendMode: value.sendMode === "messaging_service" ? "messaging_service" : "from_number",
    messagingServiceSid: parseOptionalString(value.messagingServiceSid),
    onboardingStatus:
      typeof value.onboardingStatus === "string" ? value.onboardingStatus : "not_started",
    smsSenderClass: throughput.smsSenderClass,
    smsTargetMps: throughput.smsTargetMps,
    voiceTargetCps: throughput.voiceTargetCps,
    voiceConcurrentCallLimit: throughput.voiceConcurrentCallLimit,
    parallelDispatchEnabled: throughput.parallelDispatchEnabled,
    supportNotes: typeof value.supportNotes === "string" ? value.supportNotes : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : null,
    auditTrail: Array.isArray(value.auditTrail)
      ? (value.auditTrail as WorkspaceTwilioOpsConfig["auditTrail"])
      : [],
  };
}

export function normalizePortalConfigFromTwilioData(twilioData: unknown) {
  const portalConfig =
    isRecord(twilioData) && isRecord(twilioData.portalConfig)
      ? twilioData.portalConfig
      : null;
  const ops = normalizePortalOpsConfig(portalConfig);
  return {
    ops,
    throughput: normalizePortalThroughputConfig(twilioData),
  };
}
