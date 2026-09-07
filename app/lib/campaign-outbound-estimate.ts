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
  projectDispatchTime,
  smsSendPolicy,
  type DispatchPolicy,
} from "@/lib/campaign-dispatch-policy";

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
  /**
   * Explicit dispatch policy (SMS send window or IVR calling hours with
   * dates). Takes precedence over `sendWindow`; the ETA then starts no
   * earlier than the campaign start date and reports when it cannot finish
   * before the end date.
   */
  policy?: DispatchPolicy | null;
};

export type OutboundCompletionEstimate = {
  /** Active seconds of dispatch required (ignores window pauses). */
  activeSeconds: number;
  fastFinish: Date;
  averageFinish: Date;
  slowFinish: Date;
  /** The slow bound runs past the policy's end date: the queue may not finish in time. */
  exceedsEndDate: boolean;
};

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
  const policy =
    input.policy ?? smsSendPolicy({ sms_send_window: input.sendWindow ?? null });

  let exceedsEndDate = false;
  const project = (multiplier: number): Date => {
    const neededSeconds = activeSeconds * multiplier;
    const projection = projectDispatchTime(policy, now, neededSeconds);
    if (projection.kind === "finish") return new Date(projection.finishMs);
    if (projection.kind === "beyond_end_date") {
      exceedsEndDate = true;
      return new Date(projection.notAfterMs);
    }
    // No usable in-window time within lookahead: fall back to continuous.
    return new Date(now.getTime() + neededSeconds * 1000);
  };

  const fastFinish = project(0.8);
  const averageFinish = project(1);
  const slowFinish = project(1.2);
  return { activeSeconds, fastFinish, averageFinish, slowFinish, exceedsEndDate };
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
