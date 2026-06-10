import type {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  WorkspaceNumbers,
} from "@/lib/types";
import {
  getCampaignReadiness,
  isContentReadinessComplete,
  isScheduleReadinessComplete,
} from "@/lib/campaign-readiness";

export const DEFAULT_WEEKDAY_CALLING_SCHEDULE: Schedule = {
  monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
  tuesday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
  wednesday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
  thursday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
  friday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
  saturday: { active: false, intervals: [] },
  sunday: { active: false, intervals: [] },
};

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
};

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
        "Rent or connect an outbound phone number so this campaign can place calls or send messages.",
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
): Pick<CampaignSetupStep, "label" | "description" | "action"> {
  if (campaignData.type === "message") {
    return {
      label: "Message content",
      description:
        "Write the SMS body or attach media that contacts will receive when this campaign runs.",
      action: {
        type: "scroll",
        targetId: "campaign-setup-content",
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
            type: "scroll",
            targetId: "campaign-setup-content",
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
    return {
      steps: [],
      currentStepId: null,
      currentStepNumber: 0,
      totalSteps: 0,
      allComplete: false,
    };
  }

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
        "Finish messaging onboarding so Twilio can send SMS from this workspace.",
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

  const contentMeta = buildContentStep(campaignData, workspaceId, scriptsCount);
  stepDefinitions.push({
    id: "content",
    label: contentMeta.label,
    description: contentMeta.description,
    complete: isContentReadinessComplete(readiness.issues),
    action: contentMeta.action,
  });

  stepDefinitions.push({
    id: "schedule",
    label: "Dates and hours",
    description:
      "Set when this campaign runs and which days and times outreach is allowed.",
    complete: isScheduleReadinessComplete(readiness.issues),
    action: {
      type: "scroll",
      targetId: "campaign-setup-schedule",
      label: "Set schedule",
    },
  });

  const queueMeta = buildQueueStep(audienceCount, workspaceId);
  stepDefinitions.push({
    id: "queue",
    label: "Contacts in queue",
    description: queueMeta.description,
    complete: isQueueStepComplete(queueCount),
    action: queueMeta.action,
  });

  const prerequisiteSteps = stepDefinitions;
  const prerequisitesComplete = prerequisiteSteps.every((step) => step.complete);

  stepDefinitions.push({
    id: "launch",
    label: "Ready to go",
    description: prerequisitesComplete
      ? "Everything is set. Save any changes, then start your campaign."
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

  return {
    steps,
    currentStepId,
    currentStepNumber,
    totalSteps: actionableSteps.length,
    allComplete: prerequisitesComplete && readiness.issues.length === 0,
  };
}
