import type {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  ScheduleDay,
  WorkspaceNumbers,
} from "@/lib/types";
import type { CampaignType } from "@/lib/db-types";
import {
  getCampaignReadiness,
  isContentReadinessComplete,
  isScheduleReadinessComplete,
} from "@/lib/campaign-readiness";
import {
  getCampaignReadinessAction,
  resolveCampaignReadinessRoute,
} from "@/lib/campaign-readiness-actions";
import {
  productGoalForCampaignType,
  type CampaignProductGoal,
} from "@/lib/campaign-goals";

/** Product default for new-campaign calling hours (CASL / Eastern Canada). */
export const DEFAULT_CALLING_HOURS_TIMEZONE = "America/Toronto";

import { DEFAULT_CALLING_HOURS, wallClockToUtcHm } from "@/lib/schedule-timezone";
export { wallClockToUtcHm };

/** Mon–Fri DEFAULT_CALLING_HOURS in `timeZone`, stored as UTC clock times. */
export function buildWeekdayCallingSchedule(
  timeZone: string = DEFAULT_CALLING_HOURS_TIMEZONE,
  at: Date = new Date(),
): Schedule {
  const start = wallClockToUtcHm(DEFAULT_CALLING_HOURS.start, timeZone, at);
  const end = wallClockToUtcHm(DEFAULT_CALLING_HOURS.end, timeZone, at);
  const weekday = (): ScheduleDay => ({
    active: true,
    intervals: [{ start, end }],
  });
  const inactive: ScheduleDay = { active: false, intervals: [] };

  return {
    monday: weekday(),
    tuesday: weekday(),
    wednesday: weekday(),
    thursday: weekday(),
    friday: weekday(),
    saturday: inactive,
    sunday: inactive,
  };
}

/** Snapshot at module load; prefer {@link buildWeekdayCallingSchedule} at insert time. */
export const DEFAULT_WEEKDAY_CALLING_SCHEDULE: Schedule =
  buildWeekdayCallingSchedule();

export type CampaignSetupStepId =
  | "phone_number"
  | "messaging"
  | "content"
  | "schedule"
  | "queue"
  | "launch";

export type CampaignSetupStepAction =
  | { type: "scroll"; targetId: string; label: string }
  | { type: "link"; href: string; label: string };

export type CampaignSetupStep = {
  id: CampaignSetupStepId;
  label: string;
  description: string;
  status: "complete" | "current" | "pending";
  action?: CampaignSetupStepAction;
};

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export type CampaignSetupStepsOptions = {
  campaignData: Campaign | null | undefined;
  campaignDetails: CampaignDetails;
  phoneNumbers: WorkspaceNumbers[];
  queueCount: number;
  audienceCount: number;
  scriptsCount: number;
  workspaceId: string;
  smsMessagingServiceSendersReady?: boolean;
};

export type CampaignSetupStepsResult = {
  steps: CampaignSetupStep[];
  currentStepId: CampaignSetupStepId | null;
  currentStepNumber: number;
  totalSteps: number;
  allComplete: boolean;
  goal: CampaignProductGoal | null;
  guideTitle: string;
  launchActionLabel: string;
};

function getGuideCopy(goal: CampaignProductGoal | null): {
  guideTitle: string;
  launchActionLabel: string;
} {
  switch (goal) {
    case "live_calling":
      return {
        guideTitle: "Set up live calling",
        launchActionLabel: "Start calling",
      };
    case "text_campaign":
      return {
        guideTitle: "Set up your text campaign",
        launchActionLabel: "Start text campaign",
      };
    case "automated_phone_menu":
      return {
        guideTitle: "Set up your automated phone menu",
        launchActionLabel: "Start phone menu",
      };
    case null:
      return {
        guideTitle: "Set up your campaign",
        launchActionLabel: "Start campaign",
      };
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}

export function getDefaultCampaignDates(): { start_date: string; end_date: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  };
}

export function getCampaignSetupDismissKey(campaignId: string | number): string {
  return `campaign-setup-dismissed:${campaignId}`;
}

export function shouldShowCampaignSetupGuide(opts: {
  isFirstDraftCampaign: boolean;
  dismissed: boolean;
  allComplete: boolean;
}): boolean {
  if (!opts.isFirstDraftCampaign) {
    return false;
  }
  if (opts.dismissed) {
    return false;
  }
  if (opts.allComplete) {
    return false;
  }
  return true;
}

function messageUsesMessagingService(campaignData: Campaign): boolean {
  return (
    campaignData.type === "message" &&
    campaignData.sms_send_mode === "messaging_service"
  );
}

function isPhoneNumberStepComplete(
  campaignData: Campaign,
  phoneNumbers: WorkspaceNumbers[],
): boolean {
  if (messageUsesMessagingService(campaignData)) {
    return true;
  }
  return (
    phoneNumbers.length > 0 && Boolean(String(campaignData.caller_id ?? "").trim())
  );
}

function isMessagingStepComplete(
  campaignData: Campaign,
  smsMessagingServiceSendersReady?: boolean,
): boolean {
  if (!messageUsesMessagingService(campaignData)) {
    return true;
  }
  if (!String(campaignData.sms_messaging_service_sid ?? "").trim()) {
    return false;
  }
  return smsMessagingServiceSendersReady !== false;
}

function isQueueStepComplete(queueCount: number): boolean {
  return queueCount > 0;
}

function buildPhoneNumberStep(
  phoneNumbers: WorkspaceNumbers[],
  workspaceId: string,
): Pick<CampaignSetupStep, "description" | "action"> {
  if (phoneNumbers.length === 0) {
    return {
      description:
        "Rent or connect an outbound phone number so this campaign can place calls or send messages. Renting a number also lets you set up inbound call routing and handset ringing for it.",
      action: {
        type: "link",
        href: `/workspaces/${workspaceId}/settings/numbers/purchase`,
        label: "Get a number",
      },
    };
  }

  return {
    description:
      "Choose which workspace number this campaign should use as its outbound caller ID.",
    action: {
      type: "scroll",
      targetId: "campaign-setup-number",
      label: "Select number",
    },
  };
}

function buildContentStep(
  campaignData: Campaign,
  workspaceId: string,
  scriptsCount: number,
  campaignId: string | number,
): Pick<CampaignSetupStep, "label" | "description" | "action"> {
  const contentHref = `/workspaces/${workspaceId}/campaigns/${campaignId}/script/edit`;

  if (campaignData.type === "message") {
    return {
      label: "Message content",
      description:
        "Write the SMS body or attach media that contacts will receive when this campaign runs.",
      action: {
        type: "link",
        href: contentHref,
        label: "Add message content",
      },
    };
  }

  return {
    label: "Script",
    description:
      scriptsCount > 0
        ? "Select a script so callers know what to say on each contact."
        : "Create a script so callers know what to say on each contact.",
    action:
      scriptsCount > 0
        ? {
            type: "link",
            href: contentHref,
            label: "Select a script",
          }
        : {
            type: "link",
            href: `/workspaces/${workspaceId}/scripts/new`,
            label: "Create a script",
          },
  };
}

function buildQueueStep(
  audienceCount: number,
  workspaceId: string,
): Pick<CampaignSetupStep, "description" | "action"> {
  if (audienceCount === 0) {
    return {
      description:
        "Upload contacts as an audience, then add them to this campaign's queue.",
      action: {
        type: "link",
        href: `/workspaces/${workspaceId}/audiences/new`,
        label: "Create an audience",
      },
    };
  }

  return {
    description:
      "Add contacts from an audience or search so this campaign has someone to reach.",
    action: {
      type: "link",
      href: "../queue",
      label: "Manage queue",
    },
  };
}

export function getCampaignSetupSteps(
  options: CampaignSetupStepsOptions,
): CampaignSetupStepsResult {
  const {
    campaignData,
    campaignDetails,
    phoneNumbers,
    queueCount,
    audienceCount,
    scriptsCount,
    workspaceId,
    smsMessagingServiceSendersReady,
  } = options;

  if (!campaignData) {
    const copy = getGuideCopy(null);
    return {
      steps: [],
      currentStepId: null,
      currentStepNumber: 0,
      totalSteps: 0,
      allComplete: false,
      goal: null,
      ...copy,
    };
  }

  const supportedCampaignTypes: readonly CampaignType[] = [
    "message",
    "robocall",
    "simple_ivr",
    "complex_ivr",
    "live_call",
    "email",
  ];
  const goal =
    campaignData.type &&
    supportedCampaignTypes.includes(campaignData.type as CampaignType)
      ? productGoalForCampaignType(campaignData.type as CampaignType)
      : null;
  const guideCopy = getGuideCopy(goal);
  const readiness = getCampaignReadiness(campaignData, campaignDetails, {
    queueCount,
    smsMessagingServiceSendersReady,
  });

  const stepDefinitions: Array<{
    id: CampaignSetupStepId;
    label: string;
    description: string;
    complete: boolean;
    action?: CampaignSetupStepAction;
  }> = [];

  if (messageUsesMessagingService(campaignData)) {
    stepDefinitions.push({
      id: "messaging",
      label: "Messaging setup",
      description:
        "Finish messaging setup to prepare this workspace for text campaigns.",
      complete: isMessagingStepComplete(
        campaignData,
        smsMessagingServiceSendersReady,
      ),
      action: {
        type: "link",
        href: `/workspaces/${workspaceId}/onboarding`,
        label: "Complete messaging setup",
      },
    });
  } else {
    const phoneMeta = buildPhoneNumberStep(phoneNumbers, workspaceId);
    stepDefinitions.push({
      id: "phone_number",
      label: "Outbound number",
      description: phoneMeta.description,
      complete: isPhoneNumberStepComplete(campaignData, phoneNumbers),
      action: phoneMeta.action,
    });
  }

  const contentMeta = buildContentStep(
    campaignData,
    workspaceId,
    scriptsCount,
    campaignData.id,
  );
  const contentStep = {
    id: "content",
    label:
      goal === "live_calling"
        ? "Calling script"
        : goal === "automated_phone_menu"
          ? "Phone menu script"
          : contentMeta.label,
    description: contentMeta.description,
    complete: isContentReadinessComplete(readiness.issues),
    action: contentMeta.action,
  } satisfies (typeof stepDefinitions)[number];

  const scheduleStep = {
    id: "schedule",
    label: goal === "text_campaign" ? "Send schedule" : "Calling schedule",
    description:
      "Set when this campaign runs and which days and times outreach is allowed.",
    complete: isScheduleReadinessComplete(readiness.issues),
    action: {
      type: "scroll",
      targetId: "campaign-setup-schedule",
      label: "Set schedule",
    },
  } satisfies (typeof stepDefinitions)[number];

  const queueMeta = buildQueueStep(audienceCount, workspaceId);
  const queueStep = {
    id: "queue",
    label:
      goal === "live_calling"
        ? "Contacts to call"
        : goal === "text_campaign"
          ? "Message recipients"
          : "Contacts to dial",
    description: queueMeta.description,
    complete: isQueueStepComplete(queueCount),
    action: queueMeta.action,
  } satisfies (typeof stepDefinitions)[number];

  if (goal === "live_calling") {
    stepDefinitions.push(contentStep, queueStep, scheduleStep);
  } else if (goal === "text_campaign") {
    stepDefinitions.push(contentStep, scheduleStep, queueStep);
  } else {
    stepDefinitions.push(scheduleStep, contentStep, queueStep);
  }

  const prerequisiteSteps = stepDefinitions;
  const prerequisitesComplete = prerequisiteSteps.every((step) => step.complete);

  stepDefinitions.push({
    id: "launch",
    label: "Start your campaign",
    description: prerequisitesComplete
      ? "Everything is set. Go to the Launch page and click \"Start calling\" to activate your campaign."
      : "Complete the steps above before starting this campaign.",
    complete: prerequisitesComplete && readiness.issues.length === 0,
  });

  const firstIncompleteIndex = stepDefinitions.findIndex((step) => !step.complete);
  const currentStepId =
    firstIncompleteIndex === -1
      ? null
      : stepDefinitions[firstIncompleteIndex]?.id ?? null;

  const actionableSteps = stepDefinitions.filter((step) => step.id !== "launch");
  const currentStepNumber =
    firstIncompleteIndex === -1
      ? actionableSteps.length
      : Math.max(
          actionableSteps.findIndex((step) => step.id === currentStepId) + 1,
          1,
        );

  const steps: CampaignSetupStep[] = stepDefinitions.map((step, index) => {
    let status: CampaignSetupStep["status"] = "pending";
    if (step.complete) {
      status = "complete";
    } else if (index === firstIncompleteIndex) {
      status = "current";
    }

    return {
      id: step.id,
      label: step.label,
      description: step.description,
      status,
      action: step.complete ? undefined : step.action,
    };
  });

  const firstIssue = readiness.issues[0];
  if (firstIssue && firstIncompleteIndex >= 0) {
    const correctiveAction = getCampaignReadinessAction(firstIssue.code);
    const currentStep = steps[firstIncompleteIndex];
    if (currentStep) {
      if (correctiveAction.type === "scroll") {
        currentStep.action = correctiveAction;
      } else if (campaignData.id != null) {
        const href = resolveCampaignReadinessRoute(correctiveAction, {
          workspaceId,
          campaignId: campaignData.id,
        });
        if (href) {
          currentStep.action = {
            type: "link",
            href,
            label: correctiveAction.label,
          };
        }
      }
    }
  }

  return {
    steps,
    currentStepId,
    currentStepNumber,
    totalSteps: actionableSteps.length,
    allComplete: prerequisitesComplete && readiness.issues.length === 0,
    goal,
    ...guideCopy,
  };
}
