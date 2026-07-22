import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import SelectVoicemail from "./CampaignDetailed.Voicemail";
import SelectVoiceDrop from "./live/CampaignDetailed.Live.SelectVoiceDrop";
import { SplitCampaignPrompt } from "./CampaignDetailed.SplitCampaign";
import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "./live/CampaignDetailed.Live.Switches";
import {
  Campaign,
  FileObject,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  WorkspaceNumbers,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";
import {
  estimateIvrCampaignOutbound,
  estimateMessageCampaignOutbound,
} from "@/lib/campaign-outbound-estimate";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign;

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

function getEtaRange(queueCount: number, ratePerSecond: number) {
  if (queueCount <= 0 || ratePerSecond <= 0) {
    return null;
  }
  const averageSeconds = queueCount / ratePerSecond;
  const fastFinish = new Date(Date.now() + averageSeconds * 0.8 * 1000);
  const slowFinish = new Date(Date.now() + averageSeconds * 1.2 * 1000);
  return `${formatCompletionTime(fastFinish)} - ${formatCompletionTime(slowFinish)}`;
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

/** Launch-adjacent extras moved out of Setup: dial options, pacing, split. */
export function CampaignLaunchExtras({
  campaignData,
  handleInputChange,
  mediaData,
  details,
  isBusy,
  queueCount,
  phoneNumbers,
  outboundEstimateInputs,
}: {
  campaignData: NonNullable<Campaign>;
  handleInputChange: (name: string, value: unknown) => void;
  mediaData: FileObject[];
  details: CampaignDetails;
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
  const smsEtaRange = getEtaRange(
    queueCount,
    messageEstimate.effectiveMessagesPerSecond,
  );
  const ivrEtaRange = isIvrCampaign
    ? getEtaRange(queueCount, ivrEstimate.effectiveDialAttemptsPerSecond)
    : null;

  const messageTooltipLines = [
    `Estimated effective send rate: ${formatRatePerMinute(messageEstimate.effectiveMessagesPerSecond)} (segments/sec).`,
    smsEtaRange
      ? `If sent now, queue completion is estimated around ${smsEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...messageEstimate.warnings,
  ];
  const ivrTooltipLines = [
    `Estimated effective dial-start rate: ${formatRatePerMinute(ivrEstimate.effectiveDialAttemptsPerSecond)} CPS.`,
    ivrEtaRange
      ? `If started now, queue dial attempts are estimated to complete around ${ivrEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...ivrEstimate.warnings,
  ];

  const showDialOptions = campaignData.type === "live_call" || isIvrCampaign;
  const showEstimates = campaignData.type === "message" || isIvrCampaign;

  if (!showDialOptions && !showEstimates && campaignData.type !== "message") {
    return null;
  }

  return (
    <div className="space-y-4">
      {showDialOptions ? (
        <details className="rounded-md border border-border/70 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {campaignData.type === "live_call"
              ? "Calling options"
              : "Audio & dial options"}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {campaignData.type !== "message" ? (
              <SelectVoicemail
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                campaignData={{
                  ...(campaignData.voicemail_file && {
                    voicemail_file: campaignData.voicemail_file,
                  }),
                }}
              />
            ) : null}
            {campaignData.type === "live_call" ? (
              <div className="flex flex-wrap gap-2">
                <SelectVoiceDrop
                  handleInputChange={handleInputChange}
                  mediaData={mediaData}
                  campaignData={{
                    ...("voicedrop_audio" in details &&
                      details.voicedrop_audio && {
                        voicedrop_audio: details.voicedrop_audio,
                      }),
                  }}
                />
                <HouseholdSwitch
                  handleInputChange={handleInputChange}
                  campaignData={{
                    group_household_queue: campaignData.group_household_queue,
                    dial_type: campaignData.dial_type || "call",
                  }}
                />
                <DialTypeSwitch
                  handleInputChange={handleInputChange}
                  campaignData={{
                    group_household_queue: campaignData.group_household_queue,
                    dial_type: campaignData.dial_type || "call",
                  }}
                />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

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
