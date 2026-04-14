import type {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  ScheduleDay,
  ScheduleInterval,
} from "@/lib/types";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export type CampaignReadiness = {
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
};

type NormalizedSchedule = Record<string, ScheduleDay>;

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

function getDateIssue(campaignData: Campaign) {
  if (!campaignData.start_date || !campaignData.end_date) {
    return null;
  }

  const startDate = new Date(campaignData.start_date);
  const endDate = new Date(campaignData.end_date);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Start and end dates must be valid";
  }

  if (startDate > endDate) {
    return "Start date must be before the end date";
  }

  return null;
}

function getContentIssue(campaignData: Campaign, details: CampaignDetails) {
  if (!campaignData.type || !details) return null;

  if (campaignData.type === "message") {
    const hasMessageBody = "body_text" in details && Boolean(details.body_text?.trim());
    const hasMessageMedia = "message_media" in details && Boolean(details.message_media?.length);

    return hasMessageBody || hasMessageMedia
      ? null
      : "Message content or media is required";
  }

  const hasScript = "script_id" in details && Boolean(details.script_id);

  return hasScript ? null : "Script is required";
}

export function getCampaignReadiness(
  campaignData: Campaign | null | undefined,
  details: CampaignDetails,
  options: CampaignReadinessOptions = {},
): CampaignReadiness {
  if (!campaignData) {
    return {
      startIssues: ["Campaign could not be loaded"],
      scheduleIssues: ["Campaign could not be loaded"],
      startDisabledReason: "Campaign could not be loaded",
      scheduleDisabledReason: "Campaign could not be loaded",
    };
  }

  const commonIssues: string[] = [];

  if (!campaignData.type) {
    commonIssues.push("Campaign type is required");
  }

  const messageUsesMessagingService =
    campaignData.type === "message" &&
    campaignData.sms_send_mode === "messaging_service";

  if (!campaignData.caller_id) {
    if (!messageUsesMessagingService) {
      commonIssues.push("An outbound phone number is required");
    }
  }

  if (messageUsesMessagingService) {
    if (!String(campaignData.sms_messaging_service_sid ?? "").trim()) {
      commonIssues.push(
        "Messaging Service SID is required for this send mode (save Messaging Service selection)",
      );
    }
    if (options.smsMessagingServiceSendersReady === false) {
      commonIssues.push(
        "Messaging Service has no available sender numbers; attach senders in onboarding or use a phone number",
      );
    }
  }

  if (!campaignData.start_date || !campaignData.end_date) {
    commonIssues.push("Start and end dates are required");
  }

  const dateIssue = getDateIssue(campaignData);
  if (dateIssue) {
    commonIssues.push(dateIssue);
  }

  const scheduleValidation = getScheduleValidation(campaignData.schedule);
  if (!scheduleValidation.hasCallingHours) {
    commonIssues.push("Calling hours are required");
  }

  if (scheduleValidation.hasInvalidIntervals) {
    commonIssues.push("Each active calling day needs at least one valid time window");
  }

  if (typeof options.queueCount === "number" && options.queueCount <= 0) {
    commonIssues.push("Add at least one contact before starting or scheduling");
  }

  const contentIssue = getContentIssue(campaignData, details);

  if (contentIssue) {
    commonIssues.push(contentIssue);
  }

  return {
    startIssues: commonIssues,
    scheduleIssues: commonIssues,
    startDisabledReason: commonIssues[0] ?? null,
    scheduleDisabledReason: commonIssues[0] ?? null,
  };
}
