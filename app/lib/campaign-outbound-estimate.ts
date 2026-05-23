import type {
  TwilioSendMode,
  TwilioThroughputProduct,
  TwilioTrafficClass,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";

export const QUEUE_NEXT_DELAY_MS = 200;
export const SMS_HANDLER_NEXT_DELAY_MS = 300;
export const IVR_HANDLER_NEXT_DELAY_MS = 500;

export const MESSAGE_PIPELINE_MESSAGES_PER_SECOND =
  1000 / (QUEUE_NEXT_DELAY_MS + SMS_HANDLER_NEXT_DELAY_MS);
export const IVR_PIPELINE_DIAL_ATTEMPTS_PER_SECOND =
  1000 / (QUEUE_NEXT_DELAY_MS + IVR_HANDLER_NEXT_DELAY_MS);

type ThroughputContext = {
  trafficClass: TwilioTrafficClass;
  throughputProduct: TwilioThroughputProduct;
  sendMode: TwilioSendMode;
  senderPoolSize: number;
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
  voiceCapableLocalNumbers: number;
  selectedCallerId?: string | null;
  selectedCallerIdVoiceCapable?: boolean;
};

export type MessageCampaignEstimate = {
  pipelineMessagesPerSecond: number;
  twilioAssumedMessagesPerSecond: number;
  effectiveMessagesPerSecond: number;
  senderPoolSize: number;
  senderContextLabel: string;
  footnotes: string[];
};

export type IvrCampaignEstimate = {
  pipelineDialAttemptsPerSecond: number;
  twilioAssumedDialAttemptsPerSecond: number;
  effectiveDialAttemptsPerSecond: number;
  senderPoolSize: number;
  senderContextLabel: string;
  footnotes: string[];
};

function normalizeSenderPoolSize(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function baseMessagesPerSecondByTrafficClass(
  trafficClass: TwilioTrafficClass,
): number {
  switch (trafficClass) {
    case "short_code":
      return 25;
    case "alphanumeric":
      return 8;
    case "toll_free":
      return 3;
    case "a2p10dlc":
      return 1;
    case "international_long_code":
      return 1;
    case "unknown":
    default:
      return 1;
  }
}

function throughputMultiplier(
  throughputProduct: TwilioThroughputProduct,
): number {
  switch (throughputProduct) {
    case "market_throughput":
      return 1.5;
    case "account_based_throughput":
      return 2;
    case "none":
    default:
      return 1;
  }
}

function estimateTwilioMessagesPerSecond({
  trafficClass,
  throughputProduct,
  senderPoolSize,
}: ThroughputContext): number {
  const basePerSender = baseMessagesPerSecondByTrafficClass(trafficClass);
  const productMultiplier = throughputMultiplier(throughputProduct);
  return basePerSender * productMultiplier * normalizeSenderPoolSize(senderPoolSize);
}

function estimateTwilioDialAttemptsPerSecond(senderPoolSize: number): number {
  return normalizeSenderPoolSize(senderPoolSize);
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
    trafficClass: input.portalConfig.trafficClass,
    throughputProduct: input.portalConfig.throughputProduct,
    sendMode,
    senderPoolSize,
  });
  const pipelineMessagesPerSecond = MESSAGE_PIPELINE_MESSAGES_PER_SECOND;
  const effectiveMessagesPerSecond = Math.min(
    pipelineMessagesPerSecond,
    twilioAssumedMessagesPerSecond,
  );

  return {
    pipelineMessagesPerSecond,
    twilioAssumedMessagesPerSecond,
    effectiveMessagesPerSecond,
    senderPoolSize,
    senderContextLabel,
    footnotes: [
      "Estimated Twilio throughput is based on workspace traffic class, throughput product, and sender pool size.",
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
    estimateTwilioDialAttemptsPerSecond(senderPoolSize);
  const pipelineDialAttemptsPerSecond = IVR_PIPELINE_DIAL_ATTEMPTS_PER_SECOND;
  const effectiveDialAttemptsPerSecond = Math.min(
    pipelineDialAttemptsPerSecond,
    twilioAssumedDialAttemptsPerSecond,
  );

  return {
    pipelineDialAttemptsPerSecond,
    twilioAssumedDialAttemptsPerSecond,
    effectiveDialAttemptsPerSecond,
    senderPoolSize,
    senderContextLabel,
    footnotes: [
      "Dial-attempt rate reflects queue pacing plus an assumed 1 CPS per voice-capable sender.",
      "Total IVR completion time also depends on ring time, answer rate, and call duration.",
    ],
  };
}
