import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SplitCampaignPrompt } from "./CampaignDetailed.SplitCampaign";
import {
  Campaign,
  WorkspaceNumbers,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";
import {
  estimateIvrCampaignOutbound,
  estimateMessageCampaignOutbound,
  estimateOutboundCompletion,
} from "@/lib/campaign-outbound-estimate";
import {
  ivrCallingPolicy,
  smsSendPolicy,
  type DispatchPolicy,
} from "@/lib/campaign-dispatch-policy";

type OutboundEstimateInputs = {
  portalConfig: WorkspaceTwilioOpsConfig;
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
};

const TWILIO_THROUGHPUT_DOCS_URL =
  "https://www.twilio.com/docs/messaging/guides/best-practices-at-scale";

function toCapabilities(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function countCapableNumbers(
  numbers: WorkspaceNumbers[],
  capability: "sms" | "voice",
): number {
  return numbers.reduce((count, number) => {
    const caps = toCapabilities(number?.capabilities);
    return caps?.[capability] === true ? count + 1 : count;
  }, 0);
}

function findNumberByPhone(
  numbers: WorkspaceNumbers[],
  phoneNumber: string | null | undefined,
) {
  if (!phoneNumber) {
    return null;
  }
  return numbers.find((number) => number?.phone_number === phoneNumber) ?? null;
}

function formatRatePerMinute(ratePerSecond: number): string {
  return `${Math.max(1, Math.round(ratePerSecond * 60)).toLocaleString()} / min`;
}

function formatCompletionTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getEtaRange(input: {
  queueCount: number;
  ratePerSecond: number;
  /**
   * The campaign's dispatch policy (SMS send window, or IVR calling hours
   * with start/end dates). Projected through so the ETA starts consuming
   * time at the next allowed moment instead of assuming continuous sending
* and so IVR dates bound it (E2.2).
   */
  policy: DispatchPolicy;
}) {
  const estimate = estimateOutboundCompletion({
    queueCount: input.queueCount,
    ratePerSecond: input.ratePerSecond,
    policy: input.policy,
  });
  if (!estimate) {
    return null;
  }
  const range = `${formatCompletionTime(estimate.fastFinish)} - ${formatCompletionTime(estimate.slowFinish)}`;
  return estimate.exceedsEndDate
    ? `${range} (may not finish before the campaign end date)`
    : range;
}

function OutboundEstimateAlert({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  return (
    <Alert className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-1.5">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>
          <a
            href={TWILIO_THROUGHPUT_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Twilio throughput guidance
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function CampaignLaunchExtras({
  campaignData,
  isBusy,
  queueCount,
  phoneNumbers,
  outboundEstimateInputs,
}: {
  campaignData: NonNullable<Campaign>;
  isBusy: boolean;
  queueCount: number;
  phoneNumbers: WorkspaceNumbers[];
  outboundEstimateInputs: OutboundEstimateInputs;
}) {
  const isIvrCampaign =
    campaignData.type === "robocall" ||
    campaignData.type === "simple_ivr" ||
    campaignData.type === "complex_ivr";
  const selectedCallerNumber = findNumberByPhone(phoneNumbers, campaignData.caller_id);
  const selectedCallerCaps = toCapabilities(selectedCallerNumber?.capabilities);
  const selectedCallerSmsCapable = selectedCallerCaps?.sms === true;
  const selectedCallerVoiceCapable = selectedCallerCaps?.voice === true;
  const selectedMessagingServiceSid =
    campaignData.type === "message"
      ? campaignData.sms_send_mode === "messaging_service"
        ? (campaignData.sms_messaging_service_sid ??
            outboundEstimateInputs.portalConfig.messagingServiceSid)
        : campaignData.sms_send_mode === "from_number"
          ? null
          : outboundEstimateInputs.portalConfig.sendMode === "messaging_service"
            ? outboundEstimateInputs.portalConfig.messagingServiceSid
            : null
      : null;

  const messageEstimate = estimateMessageCampaignOutbound({
    portalConfig: outboundEstimateInputs.portalConfig,
    syncSnapshot: outboundEstimateInputs.syncSnapshot,
    smsCapableLocalNumbers: countCapableNumbers(phoneNumbers, "sms"),
    selectedCallerId: campaignData.caller_id,
    selectedCallerIdSmsCapable: selectedCallerSmsCapable,
    selectedMessagingServiceSid,
  });
  const ivrEstimate = estimateIvrCampaignOutbound({
    portalConfig: outboundEstimateInputs.portalConfig,
    voiceCapableLocalNumbers: countCapableNumbers(phoneNumbers, "voice"),
    selectedCallerId: campaignData.caller_id,
    selectedCallerIdVoiceCapable: selectedCallerVoiceCapable,
  });
  const smsEtaRange = getEtaRange({
    queueCount,
    ratePerSecond: messageEstimate.effectiveMessagesPerSecond,
    policy: smsSendPolicy(campaignData),
  });
  const ivrEtaRange = isIvrCampaign
    ? getEtaRange({
        queueCount,
        ratePerSecond: ivrEstimate.effectiveCompletionPerSecond,
        policy: ivrCallingPolicy(campaignData),
      })
    : null;

  const messageTooltipLines = [
    `Estimated effective send rate: ${formatRatePerMinute(messageEstimate.effectiveMessagesPerSecond)} (segments/sec).`,
    smsEtaRange
      ? `If sent now, queue completion is estimated around ${smsEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...messageEstimate.warnings,
  ];
  const ivrTooltipLines = [
    `Estimated completion rate: ${formatRatePerMinute(
      ivrEstimate.effectiveCompletionPerSecond,
    )} calls/sec (dial starts ${formatRatePerMinute(
      ivrEstimate.effectiveDialAttemptsPerSecond,
    )} CPS; ${ivrEstimate.voiceConcurrentCallLimit} concurrent × ~${
      ivrEstimate.avgCallDurationSeconds
    }s in-flight per call).`,
    ivrEtaRange
      ? `If started now, queue completion is estimated around ${ivrEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...ivrEstimate.warnings,
  ];

  const showEstimates = campaignData.type === "message" || isIvrCampaign;

  if (!showEstimates) {
    return null;
  }

  return (
    <div className="space-y-4">
      {campaignData.type === "message" ? (
        <>
          <OutboundEstimateAlert
            title="Outbound SMS pacing estimate"
            lines={messageTooltipLines}
          />
          <SplitCampaignPrompt
            queueCount={queueCount}
            senderClass={outboundEstimateInputs.portalConfig.smsSenderClass}
            disabled={isBusy}
            overrideActive={Boolean(campaignData.allow_bulk_local_send)}
          />
        </>
      ) : null}

      {isIvrCampaign ? (
        <OutboundEstimateAlert
          title="Outbound IVR pacing estimate"
          lines={ivrTooltipLines}
        />
      ) : null}
    </div>
  );
}
