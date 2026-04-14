import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { NavLink } from "@remix-run/react";
import { MdAdd } from "react-icons/md";
import { MessageSettings } from "@/components/settings/MessageSettings";
import { FileObject } from "@supabase/storage-js";
import SelectVoicemail from "./CampaignDetailed.Voicemail";
import SelectScript from "./CampaignDetailed.SelectScript";
import ActivateButtons from "./CampaignDetailed.ActivateButtons";
import SelectVoiceDrop from "./live/CampaignDetailed.Live.SelectVoiceDrop";
import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "./live/CampaignDetailed.Live.Switches";
import {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  Survey,
  WorkspaceNumbers,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";
import { AlertCircle } from "lucide-react";
import { Tables } from "@/lib/database.types";
import {
  estimateIvrCampaignOutbound,
  estimateMessageCampaignOutbound,
} from "@/lib/campaign-outbound-estimate";

type LiveCampaignDetails = Tables<"live_campaign"> & { script: Script };
type MessageCampaignDetails = Tables<"message_campaign">;
type IVRCampaignDetails = Tables<"ivr_campaign"> & { script: Script };

const TWILIO_THROUGHPUT_DOCS_URL =
  "https://www.twilio.com/docs/messaging/guides/best-practices-at-scale";

type OutboundEstimateInputs = {
  portalConfig: WorkspaceTwilioOpsConfig;
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
};

type SmsSendContext = {
  messagingServiceReady: boolean;
  defaultMessagingServiceSid: string | null;
  attachedSenderPhoneNumbers: string[];
};

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

export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  mediaData,
  scripts,
  handleActivateButton,
  handleScheduleButton,
  details,
  mediaLinks,
  isChanged,
  isBusy,
  joinDisabled,
  scheduleDisabled,
  surveys,
  queueCount,
  phoneNumbers,
  outboundEstimateInputs,
  smsSendContext,
  handleNavigate: _handleNavigate,
}: {
  campaignData: NonNullable<Campaign>,
  handleInputChange: (name: string, value: unknown) => void,
  mediaData: FileObject[],
  scripts: Script[],
  handleActivateButton: (type: "play" | "pause" | "archive" | "schedule") => void,
  handleScheduleButton: () => void,
  details: LiveCampaignDetails | MessageCampaignDetails | IVRCampaignDetails,
  mediaLinks: string[],
  isChanged: boolean,
  isBusy: boolean,
  joinDisabled: string | null,
  scheduleDisabled: string | boolean,
  surveys: Pick<Survey, "survey_id" | "title">[],
  queueCount: number,
  phoneNumbers: WorkspaceNumbers[],
  outboundEstimateInputs: OutboundEstimateInputs,
  smsSendContext?: SmsSendContext;
  handleNavigate: (e: React.MouseEvent<HTMLButtonElement>) => void,
}) => {
  const isScriptMissing = "script_id" in details && !details.script_id;
  const isMessageContentMissing =
    "body_text" in details &&
    !details.body_text?.trim() &&
    (!("message_media" in details) || !details.message_media?.length);
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
  const smsCapableNumbers = countCapableNumbers(phoneNumbers, "sms");
  const voiceCapableNumbers = countCapableNumbers(phoneNumbers, "voice");
  const messageEstimate = estimateMessageCampaignOutbound({
    portalConfig: outboundEstimateInputs.portalConfig,
    syncSnapshot: outboundEstimateInputs.syncSnapshot,
    smsCapableLocalNumbers: smsCapableNumbers,
    selectedCallerId: campaignData.caller_id,
    selectedCallerIdSmsCapable: selectedCallerSmsCapable,
    selectedMessagingServiceSid,
  });
  const ivrEstimate = estimateIvrCampaignOutbound({
    voiceCapableLocalNumbers: voiceCapableNumbers,
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
    `Estimated effective send rate: ${formatRatePerMinute(messageEstimate.effectiveMessagesPerSecond)}.`,
    `Using ${messageEstimate.senderContextLabel}, assumed Twilio ceiling is ${formatRatePerMinute(messageEstimate.twilioAssumedMessagesPerSecond)} across ${messageEstimate.senderPoolSize} sender${messageEstimate.senderPoolSize === 1 ? "" : "s"}.`,
    smsEtaRange
      ? `If sent now, queue completion is estimated around ${smsEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...messageEstimate.footnotes,
  ];
  const hasMessageContent =
    ("body_text" in details && Boolean(String(details.body_text ?? "").trim())) ||
    Boolean("message_media" in details && details.message_media?.length);

  const smsSendModeForUi = campaignData.sms_send_mode ?? "from_number";

  const sendNowDisabled =
    isBusy ||
    isChanged ||
    !hasMessageContent ||
    (smsSendModeForUi === "messaging_service"
      ? !String(campaignData.sms_messaging_service_sid ?? "").trim()
      : !campaignData.caller_id);

  const ivrTooltipLines = [
    `Estimated effective dial-attempt rate: ${formatRatePerMinute(ivrEstimate.effectiveDialAttemptsPerSecond)}.`,
    `Using ${ivrEstimate.senderContextLabel}, assumed Twilio CPS cap is ${formatRatePerMinute(ivrEstimate.twilioAssumedDialAttemptsPerSecond)} across ${ivrEstimate.senderPoolSize} voice sender${ivrEstimate.senderPoolSize === 1 ? "" : "s"}.`,
    ivrEtaRange
      ? `If started now, queue dial attempts are estimated to complete around ${ivrEtaRange}.`
      : "Queue completion ETA appears after contacts are queued.",
    ...ivrEstimate.footnotes,
  ];

  return (
    <>
      {campaignData.type !== "message" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-end gap-2">
              <SelectVoicemail
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                campaignData={{
                  ...(campaignData.voicemail_file && { voicemail_file: campaignData.voicemail_file }),
                }}
              />
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink to="../../../audios/new">
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <SelectScript
                handleInputChange={handleInputChange}
                selectedScript={'script_id' in details && details.script_id ? details.script_id : 0}
                scripts={scripts}
              />
              <Button variant="outline" asChild size="icon" disabled={isBusy}>
                <NavLink
                  to={`../../../scripts/new?ref=${campaignData.id}`}
                >
                  <MdAdd />
                </NavLink>
              </Button>
            </div>
            {isScriptMissing && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Script is required
              </p>
            )}
          </div>
          <ActivateButtons
            joinDisabled={joinDisabled}
            scheduleDisabled={scheduleDisabled}
            isBusy={isBusy}
            handleScheduleButton={() => handleScheduleButton()}
          />
          {isIvrCampaign ? (
            <div className="w-full">
              <OutboundEstimateAlert
                title="Outbound IVR pacing estimate"
                lines={ivrTooltipLines}
              />
            </div>
          ) : null}
        </div>
      )}
      {campaignData.type === "live_call" && (
        <>
          <div className="my-4 w-full border-b-2 border-zinc-300 dark:border-zinc-600" />
          <div className="flex flex-wrap gap-2">
            <SelectVoiceDrop
              handleInputChange={handleInputChange}
              mediaData={mediaData}
              campaignData={{
                ...('voicedrop_audio' in details && details.voicedrop_audio && { voicedrop_audio: details.voicedrop_audio }),
                ...(campaignData.voicemail_file && { voicemail_file: campaignData.voicemail_file }),
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
        </>
      )}
      {campaignData.type === "message" && (
        <div className="flex flex-col gap-4">
          <FormField
            label="Send using"
            description={
              smsSendContext && !smsSendContext.messagingServiceReady
                ? "Messaging Service needs a configured service SID and at least one available sender number. Finish onboarding or choose Phone number."
                : smsSendModeForUi === "messaging_service"
                  ? "Outbound caller ID below is optional; Twilio sends from your Messaging Service pool."
                  : "Choose an outbound phone number as the From sender."
            }
          >
            <Select
              value={smsSendModeForUi}
              onValueChange={(value) => {
                if (value === "messaging_service") {
                  handleInputChange(
                    "sms_messaging_service_sid",
                    smsSendContext?.defaultMessagingServiceSid ?? "",
                  );
                  handleInputChange("sms_send_mode", "messaging_service");
                } else {
                  handleInputChange("sms_send_mode", "from_number");
                  handleInputChange("sms_messaging_service_sid", null);
                }
              }}
              disabled={isBusy}
            >
              <SelectTrigger id="sms_send_mode" className="max-w-md">
                <SelectValue placeholder="Delivery mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="messaging_service"
                  disabled={!smsSendContext?.messagingServiceReady}
                >
                  Messaging Service
                </SelectItem>
                <SelectItem value="from_number">Phone number</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <MessageSettings
            mediaLinks={mediaLinks}
            details={details as MessageCampaignDetails}
            onChange={handleInputChange}
            surveys={surveys}
          />
          {isMessageContentMissing && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Message content or media is required
            </p>
          )}
          {isChanged && (
            <p className="text-sm text-muted-foreground">
              Save your edits before sending or scheduling this message campaign.
            </p>
          )}
          <OutboundEstimateAlert
            title="Outbound SMS pacing estimate"
            lines={messageTooltipLines}
          />
          <div className="flex gap-2 justify-end items-center">
            <Button
              type="button"
              disabled={sendNowDisabled}
              onClick={() => handleActivateButton("play")}
            >
              Send Now
            </Button>
            <Button
              type="button"
              disabled={!!scheduleDisabled || isBusy}
              onClick={() => handleScheduleButton()}
            >
              Schedule Campaign
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
