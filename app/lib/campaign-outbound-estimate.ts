import type {
  Schedule,
  TwilioSendMode,
  TwilioThroughputProduct,
  TwilioTrafficClass,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";
import {
  configuredDispatcherSmsMps,
  configuredDispatcherVoiceCps,
  LEGACY_IVR_PIPELINE_CPS,
  LEGACY_MESSAGE_PIPELINE_MPS,
  twilioAssumedSmsMps,
} from "@/lib/throughput-config";
import {
  parseSendWindow,
  sendWindowActiveIntervals,
  type SendWindowDayKey,
} from "@/lib/campaign-send-window";

export const QUEUE_NEXT_DELAY_MS = 200;
export const SMS_HANDLER_NEXT_DELAY_MS = 300;
export const IVR_HANDLER_NEXT_DELAY_MS = 500;

type ThroughputContext = {
  smsSenderClass: WorkspaceTwilioOpsConfig["smsSenderClass"];
  trafficClass: TwilioTrafficClass;
  throughputProduct: TwilioThroughputProduct;
  sendMode: TwilioSendMode;
  senderPoolSize: number;
  portalConfig: WorkspaceTwilioOpsConfig;
};

export type MessageCampaignEstimateInput = {
  portalConfig: WorkspaceTwilioOpsConfig;
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
  smsCapableLocalNumbers: number;
  selectedCallerId?: string | null;
  selectedCallerIdSmsCapable?: boolean;
  selectedMessagingServiceSid?: string | null;
};

export type IvrCampaignEstimateInput = {
  portalConfig: WorkspaceTwilioOpsConfig;
  voiceCapableLocalNumbers: number;
  selectedCallerId?: string | null;
  selectedCallerIdVoiceCapable?: boolean;
};

export type MessageCampaignEstimate = {
  pipelineMessagesPerSecond: number;
  configuredDispatcherMessagesPerSecond: number;
  twilioAssumedMessagesPerSecond: number;
  effectiveMessagesPerSecond: number;
  senderPoolSize: number;
  senderContextLabel: string;
  footnotes: string[];
  warnings: string[];
};

export type IvrCampaignEstimate = {
  pipelineDialAttemptsPerSecond: number;
  configuredDispatcherDialAttemptsPerSecond: number;
  twilioAssumedDialAttemptsPerSecond: number;
  effectiveDialAttemptsPerSecond: number;
  voiceConcurrentCallLimit: number;
  senderPoolSize: number;
  senderContextLabel: string;
  footnotes: string[];
  warnings: string[];
};

function normalizeSenderPoolSize(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

const OUTBOUND_ETA_DAY_KEYS: SendWindowDayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export type OutboundCompletionInput = {
  /** Number of queued sends remaining. */
  queueCount: number;
  /** Effective throughput in messages (or dial starts) per second. */
  ratePerSecond: number;
  /** Reference "now"; defaults to the current time. */
  now?: Date;
  /**
   * Optional per-campaign send window. When present, the projection only
   * consumes throughput during in-window time, so the ETA reflects windowed
   * sending rather than assuming continuous dispatch. `null`/undefined =>
   * unrestricted.
   */
  sendWindow?: Schedule | null;
};

export type OutboundCompletionEstimate = {
  /** Active seconds of dispatch required (ignores window pauses). */
  activeSeconds: number;
  fastFinish: Date;
  averageFinish: Date;
  slowFinish: Date;
};

/**
 * Walk a weekly send window forward from `now`, consuming `neededSeconds` of
 * in-window dispatch time, and return the wall-clock finish. Bounded lookahead
 * (~1 year); falls back to continuous projection if the window has no active
 * time. Overnight intervals are approximated by extending past midnight, which
 * is acceptable for an ETA range (the built-in presets never wrap midnight).
 */
function projectThroughSendWindow(
  now: Date,
  neededSeconds: number,
  schedule: Schedule,
): Date {
  let remaining = neededSeconds;
  const nowMs = now.getTime();
  const baseMidnightMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  for (let dayOffset = 0; dayOffset < 366 && remaining > 0; dayOffset++) {
    const dayStartMs = baseMidnightMs + dayOffset * MS_PER_DAY;
    const dayKey = OUTBOUND_ETA_DAY_KEYS[new Date(dayStartMs).getUTCDay()];
    if (!dayKey) continue;

    const intervals = sendWindowActiveIntervals(schedule, dayKey).sort(
      (a, b) => a.start - b.start,
    );
    for (const interval of intervals) {
      const intervalStartMs = dayStartMs + interval.start * MS_PER_MINUTE;
      const spanMinutes =
        interval.end > interval.start
          ? interval.end - interval.start
          : interval.end + 24 * 60 - interval.start;
      const intervalEndMs = intervalStartMs + spanMinutes * MS_PER_MINUTE;
      const effectiveStartMs = Math.max(intervalStartMs, nowMs);
      if (intervalEndMs <= effectiveStartMs) continue;

      const availableSeconds = (intervalEndMs - effectiveStartMs) / 1000;
      if (availableSeconds >= remaining) {
        return new Date(effectiveStartMs + remaining * 1000);
      }
      remaining -= availableSeconds;
    }
  }

  // No usable in-window time within lookahead: fall back to continuous.
  return new Date(nowMs + neededSeconds * 1000);
}

/**
 * Projected queue-completion estimate at a given effective throughput, with
 * optional send-window awareness. Returns `null` when there is nothing to send
 * or the rate is non-positive. The fast/slow bounds apply a +/-20% spread to
 * the required active dispatch time before projecting through the window.
 */
export function estimateOutboundCompletion(
  input: OutboundCompletionInput,
): OutboundCompletionEstimate | null {
  const { queueCount, ratePerSecond } = input;
  if (queueCount <= 0 || ratePerSecond <= 0) {
    return null;
  }

  const now = input.now ?? new Date();
  const activeSeconds = queueCount / ratePerSecond;
  const window = input.sendWindow ? parseSendWindow(input.sendWindow) : null;

  const project = (multiplier: number): Date => {
    const neededSeconds = activeSeconds * multiplier;
    if (!window) {
      return new Date(now.getTime() + neededSeconds * 1000);
    }
    return projectThroughSendWindow(now, neededSeconds, window);
  };

  return {
    activeSeconds,
    fastFinish: project(0.8),
    averageFinish: project(1),
    slowFinish: project(1.2),
  };
}

function estimateTwilioMessagesPerSecond({
  smsSenderClass,
  trafficClass,
  throughputProduct,
  senderPoolSize,
}: ThroughputContext): number {
  return twilioAssumedSmsMps({
    smsSenderClass,
    trafficClass,
    throughputProduct,
    senderPoolSize,
  });
}

function estimateTwilioDialAttemptsPerSecond(
  portalConfig: WorkspaceTwilioOpsConfig,
): number {
  if (portalConfig.parallelDispatchEnabled) {
    return Math.max(0.1, portalConfig.voiceTargetCps);
  }
  return LEGACY_IVR_PIPELINE_CPS;
}

export function estimateMessageCampaignOutbound(
  input: MessageCampaignEstimateInput,
): MessageCampaignEstimate {
  const sendMode = input.portalConfig.sendMode;
  const resolvedMessagingServiceSid =
    input.selectedMessagingServiceSid ?? input.portalConfig.messagingServiceSid;
  const senderPoolSize = sendMode === "messaging_service"
    ? Math.max(input.syncSnapshot.phoneNumberCount, input.smsCapableLocalNumbers, 1)
    : input.selectedCallerId && input.selectedCallerIdSmsCapable
      ? 1
      : Math.max(input.smsCapableLocalNumbers, 1);
  const senderContextLabel = sendMode === "messaging_service"
    ? resolvedMessagingServiceSid
      ? `Messaging Service ${resolvedMessagingServiceSid}`
      : "workspace messaging service"
    : input.selectedCallerId
      ? `selected number ${input.selectedCallerId}`
      : "workspace sender numbers";

  const twilioAssumedMessagesPerSecond = estimateTwilioMessagesPerSecond({
    smsSenderClass: input.portalConfig.smsSenderClass,
    trafficClass: input.portalConfig.trafficClass,
    throughputProduct: input.portalConfig.throughputProduct,
    sendMode,
    senderPoolSize,
    portalConfig: input.portalConfig,
  });
  const pipelineMessagesPerSecond = LEGACY_MESSAGE_PIPELINE_MPS;
  const configuredDispatcherMessagesPerSecond = configuredDispatcherSmsMps(
    input.portalConfig,
  );
  const effectiveMessagesPerSecond = Math.min(
    configuredDispatcherMessagesPerSecond,
    twilioAssumedMessagesPerSecond,
  );

  const warnings: string[] = [];
  if (input.portalConfig.smsSenderClass === "ca_local") {
    warnings.push(
      "Canadian local long codes are not recommended for bulk SMS campaigns. Use verified toll-free or a Canadian short code for higher deliverability.",
    );
  }
  if (
    input.portalConfig.parallelDispatchEnabled &&
    configuredDispatcherMessagesPerSecond > twilioAssumedMessagesPerSecond
  ) {
    warnings.push(
      "Configured SMS dispatch rate exceeds the estimated Twilio sender limit.",
    );
  }
  if (!input.portalConfig.parallelDispatchEnabled) {
    warnings.push(
      "Legacy sequential dispatch is still enabled (~2 MPS). Enable parallel dispatch after Twilio limits are confirmed.",
    );
  }

  return {
    pipelineMessagesPerSecond,
    configuredDispatcherMessagesPerSecond,
    twilioAssumedMessagesPerSecond,
    effectiveMessagesPerSecond,
    senderPoolSize,
    senderContextLabel,
    warnings,
    footnotes: [
      "MPS is measured in message segments per second.",
      "Configured dispatcher rate reflects parallel dispatch when enabled; otherwise legacy pipeline pacing applies.",
      "Carrier filtering, compliance checks, and real-time Twilio queueing can reduce actual throughput.",
    ],
  };
}

export function estimateIvrCampaignOutbound(
  input: IvrCampaignEstimateInput,
): IvrCampaignEstimate {
  const senderPoolSize = input.selectedCallerId && input.selectedCallerIdVoiceCapable
    ? 1
    : Math.max(input.voiceCapableLocalNumbers, 1);
  const senderContextLabel = input.selectedCallerId
    ? `selected number ${input.selectedCallerId}`
    : "workspace voice-capable numbers";
  const twilioAssumedDialAttemptsPerSecond =
    estimateTwilioDialAttemptsPerSecond(input.portalConfig);
  const pipelineDialAttemptsPerSecond = LEGACY_IVR_PIPELINE_CPS;
  const configuredDispatcherDialAttemptsPerSecond = configuredDispatcherVoiceCps(
    input.portalConfig,
  );
  const effectiveDialAttemptsPerSecond = Math.min(
    configuredDispatcherDialAttemptsPerSecond,
    twilioAssumedDialAttemptsPerSecond,
  );

  const warnings: string[] = [];
  if (
    input.portalConfig.parallelDispatchEnabled &&
    configuredDispatcherDialAttemptsPerSecond > 5
  ) {
    warnings.push(
      "Voice CPS above 5 typically requires Twilio Business Profile approval and a CPS increase.",
    );
  }
  if (!input.portalConfig.parallelDispatchEnabled) {
    warnings.push(
      "Legacy sequential IVR dispatch is still enabled (~1.4 dial starts/sec).",
    );
  }

  return {
    pipelineDialAttemptsPerSecond,
    configuredDispatcherDialAttemptsPerSecond,
    twilioAssumedDialAttemptsPerSecond,
    effectiveDialAttemptsPerSecond,
    voiceConcurrentCallLimit: input.portalConfig.voiceConcurrentCallLimit,
    senderPoolSize,
    senderContextLabel,
    warnings,
    footnotes: [
      "Dial-attempt rate reflects dial starts per second, not completed calls.",
      "Total IVR completion time also depends on ring time, answer rate, call duration, and concurrent call limits.",
    ],
  };
}
