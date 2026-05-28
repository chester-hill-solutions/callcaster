import type {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  ScheduleDay,
  ScheduleInterval,
  TwilioSmsSenderClass,
} from "@/lib/types";
import { isBulkSmsSenderMisaligned } from "@/lib/throughput-config";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export type CampaignReadinessCode =
  | "campaign_not_loaded"
  | "campaign_type_required"
  | "outbound_number_required"
  | "messaging_sid_required"
  | "messaging_senders_unavailable"
  | "dates_required"
  | "dates_invalid"
  | "start_after_end"
  | "calling_hours_required"
  | "invalid_intervals"
  | "queue_empty"
  | "bulk_sender_misaligned"
  | "script_required"
  | "message_content_required";

export type CampaignReadinessIssue = {
  code: CampaignReadinessCode;
  message: string;
};

export type CampaignReadiness = {
  issues: CampaignReadinessIssue[];
  startIssues: string[];
  scheduleIssues: string[];
  startDisabledReason: string | null;
  scheduleDisabledReason: string | null;
};

type CampaignReadinessOptions = {
  queueCount?: number | null;
  /**
   * When `false`, message campaigns in messaging_service mode are blocked
   * (e.g. no onboarding senders and no SMS-capable workspace numbers).
   * When omitted, sender inventory is not validated here.
   */
  smsMessagingServiceSendersReady?: boolean;
  /** Workspace SMS sender class for bulk throughput/deliverability gates. */
  smsSenderClass?: TwilioSmsSenderClass;
};

type NormalizedSchedule = Record<string, ScheduleDay>;

const SCHEDULE_READINESS_CODES = new Set<CampaignReadinessCode>([
  "dates_required",
  "dates_invalid",
  "start_after_end",
  "calling_hours_required",
  "invalid_intervals",
]);

export const CAMPAIGN_CONTENT_READINESS_CODES = [
  "script_required",
  "message_content_required",
] as const satisfies readonly CampaignReadinessCode[];

function issue(
  code: CampaignReadinessCode,
  message: string,
): CampaignReadinessIssue {
  return { code, message };
}

function issuesToMessages(issues: CampaignReadinessIssue[]): string[] {
  return issues.map((entry) => entry.message);
}

/** Minutes since midnight for "HH:mm" / "H:mm" in 24h form; null if malformed. */
function parseClockMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function isValidCallingInterval(interval: ScheduleInterval): boolean {
  const startMinutes = parseClockMinutes(interval.start);
  const endMinutes = parseClockMinutes(interval.end);
  if (startMinutes === null || endMinutes === null) {
    return false;
  }
  if (startMinutes === endMinutes) {
    return false;
  }
  // Matches `isWithinCallingHours` in campaign.server: end before start means overnight.
  return true;
}

function parseSchedule(schedule: Campaign["schedule"]): NormalizedSchedule | null {
  if (!schedule) return null;

  if (typeof schedule === "string") {
    try {
      return parseSchedule(JSON.parse(schedule) as Campaign["schedule"]);
    } catch {
      return null;
    }
  }

  const normalizedEntries = Object.entries(schedule).flatMap(([day, value]) => {
    if (!value || typeof value !== "object" || !("active" in value)) {
      return [];
    }

    const intervals = Array.isArray(value.intervals)
      ? value.intervals.filter(
          (interval: unknown): interval is ScheduleInterval =>
            Boolean(interval) &&
            typeof interval === "object" &&
            interval !== null &&
            "start" in interval &&
            "end" in interval &&
            typeof interval.start === "string" &&
            typeof interval.end === "string",
        )
      : [];

    return [[day, { active: Boolean(value.active), intervals }] as const];
  });

  return Object.fromEntries(normalizedEntries);
}

function getScheduleValidation(schedule: Campaign["schedule"]) {
  const parsedSchedule = parseSchedule(schedule);

  if (!parsedSchedule) {
    return {
      hasCallingHours: false,
      hasInvalidIntervals: false,
    };
  }

  let hasCallingHours = false;
  let hasInvalidIntervals = false;

  Object.values(parsedSchedule).forEach((day) => {
    if (!day.active) {
      return;
    }

    if (!day.intervals.length) {
      hasInvalidIntervals = true;
      return;
    }

    const hasValidIntervals = day.intervals.some((interval) => isValidCallingInterval(interval));
    if (hasValidIntervals) {
      hasCallingHours = true;
    }

    if (
      !hasValidIntervals ||
      day.intervals.some((interval) => !isValidCallingInterval(interval))
    ) {
      hasInvalidIntervals = true;
    }
  });

  return {
    hasCallingHours,
    hasInvalidIntervals,
  };
}

function getDateIssue(campaignData: Campaign): CampaignReadinessIssue | null {
  if (!campaignData.start_date || !campaignData.end_date) {
    return null;
  }

  const startDate = new Date(campaignData.start_date);
  const endDate = new Date(campaignData.end_date);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return issue("dates_invalid", "Start and end dates must be valid");
  }

  if (startDate > endDate) {
    return issue("start_after_end", "Start date must be before the end date");
  }

  return null;
}

function getContentIssue(
  campaignData: Campaign,
  details: CampaignDetails,
): CampaignReadinessIssue | null {
  if (!campaignData.type || !details) return null;

  if (campaignData.type === "message") {
    const hasMessageBody = "body_text" in details && Boolean(details.body_text?.trim());
    const hasMessageMedia = "message_media" in details && Boolean(details.message_media?.length);

    return hasMessageBody || hasMessageMedia
      ? null
      : issue("message_content_required", "Message content or media is required");
  }

  const hasScript = "script_id" in details && Boolean(details.script_id);

  return hasScript ? null : issue("script_required", "Script is required");
}

export function getCampaignContentReadinessIssues(
  issues: readonly CampaignReadinessIssue[] | readonly string[],
): string[] {
  const contentCodes = new Set<string>(CAMPAIGN_CONTENT_READINESS_CODES);
  return issues
    .map((entry) =>
      typeof entry === "string"
        ? null
        : contentCodes.has(entry.code)
          ? entry.message
          : null,
    )
    .filter((message): message is string => Boolean(message));
}

export function hasCampaignReadinessCode(
  issues: readonly CampaignReadinessIssue[],
  code: CampaignReadinessCode,
): boolean {
  return issues.some((entry) => entry.code === code);
}

export function hasAnyCampaignReadinessCode(
  issues: readonly CampaignReadinessIssue[],
  codes: ReadonlySet<CampaignReadinessCode>,
): boolean {
  return issues.some((entry) => codes.has(entry.code));
}

export function isScheduleReadinessComplete(
  issues: readonly CampaignReadinessIssue[],
): boolean {
  return !hasAnyCampaignReadinessCode(issues, SCHEDULE_READINESS_CODES);
}

export function isContentReadinessComplete(
  issues: readonly CampaignReadinessIssue[],
): boolean {
  return !hasAnyCampaignReadinessCode(
    issues,
    new Set(CAMPAIGN_CONTENT_READINESS_CODES),
  );
}

export function getCampaignReadiness(
  campaignData: Campaign | null | undefined,
  details: CampaignDetails,
  options: CampaignReadinessOptions = {},
): CampaignReadiness {
  if (!campaignData) {
    const issues = [issue("campaign_not_loaded", "Campaign could not be loaded")];
    return {
      issues,
      startIssues: issuesToMessages(issues),
      scheduleIssues: issuesToMessages(issues),
      startDisabledReason: issues[0]?.message ?? null,
      scheduleDisabledReason: issues[0]?.message ?? null,
    };
  }

  const commonIssues: CampaignReadinessIssue[] = [];

  if (!campaignData.type) {
    commonIssues.push(issue("campaign_type_required", "Campaign type is required"));
  }

  const messageUsesMessagingService =
    campaignData.type === "message" &&
    campaignData.sms_send_mode === "messaging_service";

  if (!campaignData.caller_id) {
    if (!messageUsesMessagingService) {
      commonIssues.push(
        issue("outbound_number_required", "An outbound phone number is required"),
      );
    }
  }

  if (messageUsesMessagingService) {
    if (!String(campaignData.sms_messaging_service_sid ?? "").trim()) {
      commonIssues.push(
        issue(
          "messaging_sid_required",
          "Messaging Service SID is required for this send mode (save Messaging Service selection)",
        ),
      );
    }
    if (options.smsMessagingServiceSendersReady === false) {
      commonIssues.push(
        issue(
          "messaging_senders_unavailable",
          "Messaging Service has no available sender numbers; attach senders in onboarding or use a phone number",
        ),
      );
    }
  }

  if (!campaignData.start_date || !campaignData.end_date) {
    commonIssues.push(issue("dates_required", "Start and end dates are required"));
  }

  const dateIssue = getDateIssue(campaignData);
  if (dateIssue) {
    commonIssues.push(dateIssue);
  }

  const scheduleValidation = getScheduleValidation(campaignData.schedule);
  if (!scheduleValidation.hasCallingHours) {
    commonIssues.push(issue("calling_hours_required", "Calling hours are required"));
  }

  if (scheduleValidation.hasInvalidIntervals) {
    commonIssues.push(
      issue(
        "invalid_intervals",
        "Each active calling day needs at least one valid time window",
      ),
    );
  }

  if (typeof options.queueCount === "number" && options.queueCount <= 0) {
    commonIssues.push(
      issue(
        "queue_empty",
        "Add at least one contact before starting or scheduling",
      ),
    );
  }

  if (
    campaignData.type === "message" &&
    options.smsSenderClass &&
    typeof options.queueCount === "number" &&
    isBulkSmsSenderMisaligned(options.smsSenderClass, options.queueCount)
  ) {
    commonIssues.push(
      issue(
        "bulk_sender_misaligned",
        "Bulk SMS at this queue size requires verified toll-free or a Canadian short code sender. Canadian local long codes are not recommended for campaign volume.",
      ),
    );
  }

  const contentIssue = getContentIssue(campaignData, details);

  if (contentIssue) {
    commonIssues.push(contentIssue);
  }

  const startIssues = issuesToMessages(commonIssues);

  return {
    issues: commonIssues,
    startIssues,
    scheduleIssues: startIssues,
    startDisabledReason: startIssues[0] ?? null,
    scheduleDisabledReason: startIssues[0] ?? null,
  };
}
