import type { WorkspaceTwilioOpsConfig } from "@/lib/types";

/**
 * Resolves Twilio Messaging Service SID for outbound SMS.
 * Precedence: explicit API override → per-campaign MS mode → workspace portal defaults.
 */
export function resolveTwilioSmsMessagingServiceSid(args: {
  explicitRequestSid: string | null;
  campaignSmsSendMode: string | null | undefined;
  campaignSmsMessagingServiceSid: string | null | undefined;
  portalConfig: WorkspaceTwilioOpsConfig;
}): string | null {
  if (args.explicitRequestSid) {
    return args.explicitRequestSid;
  }

  const portalSid =
    args.portalConfig.sendMode === "messaging_service"
      ? args.portalConfig.messagingServiceSid
      : null;

  if (args.campaignSmsSendMode === "messaging_service") {
    const sid = String(args.campaignSmsMessagingServiceSid ?? "").trim();
    return sid || portalSid;
  }

  if (args.campaignSmsSendMode === "from_number") {
    return null;
  }

  // Legacy campaigns (sms_send_mode null): preserve workspace portal behavior.
  return portalSid;
}

export function messageCampaignRequiresCallerId(
  campaignSmsSendMode: string | null | undefined,
): boolean {
  return campaignSmsSendMode !== "messaging_service";
}

/** Twilio requires scheduled sends at least 15 minutes out. */
export const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;
/** Twilio caps scheduled sends at 35 days out. */
export const MAX_SCHEDULE_LEAD_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * Thrown for "send later" validation failures (bad/out-of-window `sendAt`,
 * missing Messaging Service). Kept distinct from Twilio API errors so
 * callers can surface the exact message instead of the generic
 * `presentTwilioError` fallback text.
 */
export class ScheduleValidationError extends Error {}

/** Validates a requested scheduled-send time against Twilio's fixed-schedule window. */
export function validateScheduledSendAt(
  sendAt: string,
  now: Date = new Date(),
): Date {
  const date = new Date(sendAt);
  if (Number.isNaN(date.getTime())) {
    throw new ScheduleValidationError("sendAt must be a valid date/time");
  }

  const leadMs = date.getTime() - now.getTime();
  if (leadMs < MIN_SCHEDULE_LEAD_MS) {
    throw new ScheduleValidationError(
      "Scheduled send time must be at least 15 minutes from now",
    );
  }
  if (leadMs > MAX_SCHEDULE_LEAD_MS) {
    throw new ScheduleValidationError(
      "Scheduled send time must be within 35 days from now",
    );
  }

  return date;
}
