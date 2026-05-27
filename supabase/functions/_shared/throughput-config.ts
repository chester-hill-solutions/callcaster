export type TwilioSmsSenderClass =
  | "unknown"
  | "ca_local"
  | "verified_toll_free"
  | "ca_short_code"
  | "us_a2p10dlc";

export type WorkspaceThroughputPortalConfig = {
  smsSenderClass: TwilioSmsSenderClass;
  smsTargetMps: number;
  voiceTargetCps: number;
  voiceConcurrentCallLimit: number;
  parallelDispatchEnabled: boolean;
};

export const MAX_QUEUE_ATTEMPTS = 5;
export const STALE_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
export const DISPATCH_TICK_MS = 1000;
export const LEGACY_MESSAGE_PIPELINE_MPS = 2;
export const LEGACY_IVR_PIPELINE_CPS = 1000 / 700;

const SMS_SENDER_CLASS_VALUES = new Set([
  "unknown",
  "ca_local",
  "verified_toll_free",
  "ca_short_code",
  "us_a2p10dlc",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function defaultSmsTargetMps(senderClass: TwilioSmsSenderClass): number {
  switch (senderClass) {
    case "ca_short_code":
      return 100;
    case "verified_toll_free":
      return 3;
    case "us_a2p10dlc":
      return 1;
    case "ca_local":
      return 1;
    case "unknown":
    default:
      return 1;
  }
}

export function normalizePortalThroughputConfig(
  twilioData: unknown,
): WorkspaceThroughputPortalConfig {
  const portalConfig = isRecord(twilioData) && isRecord(twilioData.portalConfig)
    ? twilioData.portalConfig
    : null;

  const rawSenderClass = portalConfig?.smsSenderClass;
  const smsSenderClass =
    typeof rawSenderClass === "string" &&
      SMS_SENDER_CLASS_VALUES.has(rawSenderClass)
      ? (rawSenderClass as TwilioSmsSenderClass)
      : "unknown";

  const parallelDispatchEnabled =
    portalConfig?.parallelDispatchEnabled === true;

  return {
    smsSenderClass,
    smsTargetMps: pickNumber(
      portalConfig?.smsTargetMps,
      defaultSmsTargetMps(smsSenderClass),
    ),
    voiceTargetCps: pickNumber(portalConfig?.voiceTargetCps, 1),
    voiceConcurrentCallLimit: pickNumber(
      portalConfig?.voiceConcurrentCallLimit,
      100,
    ),
    parallelDispatchEnabled,
  };
}

export function configuredDispatcherSmsMps(
  config: WorkspaceThroughputPortalConfig,
): number {
  if (!config.parallelDispatchEnabled) {
    return LEGACY_MESSAGE_PIPELINE_MPS;
  }
  return Math.max(0.1, config.smsTargetMps);
}

export function configuredDispatcherVoiceCps(
  config: WorkspaceThroughputPortalConfig,
): number {
  if (!config.parallelDispatchEnabled) {
    return LEGACY_IVR_PIPELINE_CPS;
  }
  return Math.max(0.1, config.voiceTargetCps);
}

export function claimBatchSizeForRate(
  ratePerSecond: number,
  windowMs = DISPATCH_TICK_MS,
): number {
  return Math.max(1, Math.ceil(ratePerSecond * (windowMs / 1000)));
}
