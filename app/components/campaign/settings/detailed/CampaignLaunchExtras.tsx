import { useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { AddAudioSheet } from "../AddAudioSheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  estimateOutboundCompletion,
} from "@/lib/campaign-outbound-estimate";
import type { Schedule } from "@/lib/types";

type CampaignDetails = NonNullable<LiveCampaign | MessageCampaign | IVRCampaign>;

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
   * Raw stored dispatch-time restriction (SMS send window or calling-hours
   * schedule). Projected through so the ETA starts consuming time at the
   * next in-window moment instead of assuming continuous sending (#1351).
   */
  dispatchWindow?: Schedule | null;
}) {
  const estimate = estimateOutboundCompletion({
    queueCount: input.queueCount,
    ratePerSecond: input.ratePerSecond,
    sendWindow: input.dispatchWindow ?? null,
  });
  if (!estimate) {
    return null;
  }
  return `${formatCompletionTime(estimate.fastFinish)} - ${formatCompletionTime(estimate.slowFinish)}`;
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
  workspaceId,
}: {
  campaignData: NonNullable<Campaign>;
  handleInputChange: (name: string, value: unknown) => void;
  mediaData: FileObject[];
  details: CampaignDetails;
  isBusy: boolean;
  queueCount: number;
  phoneNumbers: WorkspaceNumbers[];
  outboundEstimateInputs: OutboundEstimateInputs;
  workspaceId: string;
}) {
  const [addAudioOpen, setAddAudioOpen] = useState(false);
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
    dispatchWindow: (campaignData.sms_send_window ?? null) as Schedule | null,
  });
  const ivrEtaRange = isIvrCampaign
    ? getEtaRange({
        queueCount,
        ratePerSecond: ivrEstimate.effectiveDialAttemptsPerSecond,
        dispatchWindow: (campaignData.schedule ?? null) as Schedule | null,
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
              <div className="flex flex-wrap items-end gap-3">
                <SelectVoicemail
                  handleInputChange={handleInputChange}
                  mediaData={mediaData}
                  campaignData={{
                    ...(campaignData.voicemail_file && {
                      voicemail_file: campaignData.voicemail_file,
                    }),
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => setAddAudioOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add audio
                </Button>
              </div>
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
          <AddAudioSheet
            workspaceId={workspaceId}
            open={addAudioOpen}
            onOpenChange={setAddAudioOpen}
          />
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
