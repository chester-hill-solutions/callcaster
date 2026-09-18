import type {
  TwilioSmsSenderClass,
  TwilioThroughputProduct,
  TwilioTrafficClass,
  WorkspaceTwilioOpsConfig,
} from "@/lib/types";

export const LEGACY_MESSAGE_PIPELINE_MPS = 2;
export const LEGACY_IVR_PIPELINE_CPS = 1000 / 700;

export const MAX_QUEUE_ATTEMPTS = 5;
export const STALE_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
export const DISPATCH_TICK_MS = 1000;

/**
 * Upper bound on one send-window/calling-hours deferral. The successor wakes
 * at min(nextOpenAt, now + this): exact for boundaries within reach, but a
 * boundary days away cannot pin the chain to window config that may change
 * first. Every wake re-reads the campaign, so a window edited or removed
 * while deferred takes effect within one bounded hop, and the hop that lands
 * inside the cap still resumes exactly at the true boundary.
 */
export const SEND_WINDOW_MAX_DEFER_MS = 60 * 60 * 1000;

export function defaultSmsTargetMps(senderClass: TwilioSmsSenderClass): number {
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

export function defaultVoiceTargetCps(): number {
  return 1;
}

export function defaultVoiceConcurrentCallLimit(): number {
  return 100;
}

export function twilioAssumedSmsMps(args: {
  smsSenderClass: TwilioSmsSenderClass;
  trafficClass: TwilioTrafficClass;
  throughputProduct: TwilioThroughputProduct;
  senderPoolSize: number;
}): number {
  const pool = Math.max(1, Math.floor(args.senderPoolSize));
  const baseBySender = defaultSmsTargetMps(args.smsSenderClass);
  const productMultiplier =
    args.throughputProduct === "account_based_throughput"
      ? 2
      : args.throughputProduct === "market_throughput"
        ? 1.5
        : 1;

  if (args.smsSenderClass === "us_a2p10dlc" || args.trafficClass === "a2p10dlc") {
    return baseBySender * productMultiplier;
  }

  return baseBySender * productMultiplier * pool;
}

export function configuredDispatcherSmsMps(
  config: Pick<
    WorkspaceTwilioOpsConfig,
    "parallelDispatchEnabled" | "smsTargetMps"
  >,
): number {
  if (!config.parallelDispatchEnabled) {
    return LEGACY_MESSAGE_PIPELINE_MPS;
  }
  return Math.max(0.1, config.smsTargetMps);
}

export function configuredDispatcherVoiceCps(
  config: Pick<
    WorkspaceTwilioOpsConfig,
    "parallelDispatchEnabled" | "voiceTargetCps"
  >,
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

export function isBulkSmsSenderMisaligned(
  senderClass: TwilioSmsSenderClass,
  queueCount: number,
  warnThreshold = 500,
): boolean {
  return senderClass === "ca_local" && queueCount >= warnThreshold;
}
