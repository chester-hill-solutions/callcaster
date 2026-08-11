import type { CampaignReadinessCode } from "@/lib/campaign-readiness";

export const CAMPAIGN_READINESS_ROUTE_TEMPLATES = {
  campaigns: "/workspaces/:workspaceId/campaigns",
  campaignQueue: "/workspaces/:workspaceId/campaigns/:campaignId/queue",
  campaignContent: "/workspaces/:workspaceId/campaigns/:campaignId/script/edit",
  onboarding: "/workspaces/:workspaceId/onboarding",
} as const;

type CampaignReadinessRouteTemplate =
  (typeof CAMPAIGN_READINESS_ROUTE_TEMPLATES)[keyof typeof CAMPAIGN_READINESS_ROUTE_TEMPLATES];

export type CampaignReadinessCorrectiveAction =
  | {
      type: "scroll";
      targetId:
        | "type"
        | "campaign-setup-number"
        | "campaign-setup-schedule"
        | "sms_send_mode";
      label: string;
    }
  | {
      type: "route";
      template: CampaignReadinessRouteTemplate;
      label: string;
    };

/**
 * One deterministic correction for every blocking readiness code.
 * Scroll targets are existing campaign settings element IDs; route templates
 * correspond to registered workspace product routes.
 */
export const CAMPAIGN_READINESS_ACTIONS = {
  campaign_not_loaded: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaigns,
    label: "View campaigns",
  },
  campaign_type_required: {
    type: "scroll",
    targetId: "type",
    label: "Select campaign type",
  },
  outbound_number_required: {
    type: "scroll",
    targetId: "campaign-setup-number",
    label: "Select outbound number",
  },
  outbound_number_unavailable: {
    type: "scroll",
    targetId: "campaign-setup-number",
    label: "Replace outbound number",
  },
  outbound_number_incapable: {
    type: "scroll",
    targetId: "campaign-setup-number",
    label: "Select a capable number",
  },
  messaging_sid_required: {
    type: "scroll",
    targetId: "sms_send_mode",
    label: "Configure send mode",
  },
  messaging_senders_unavailable: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.onboarding,
    label: "Set up messaging senders",
  },
  dates_required: {
    type: "scroll",
    targetId: "campaign-setup-schedule",
    label: "Set campaign dates",
  },
  dates_invalid: {
    type: "scroll",
    targetId: "campaign-setup-schedule",
    label: "Correct campaign dates",
  },
  start_after_end: {
    type: "scroll",
    targetId: "campaign-setup-schedule",
    label: "Correct campaign dates",
  },
  calling_hours_required: {
    type: "scroll",
    targetId: "campaign-setup-schedule",
    label: "Set calling hours",
  },
  invalid_intervals: {
    type: "scroll",
    targetId: "campaign-setup-schedule",
    label: "Correct calling hours",
  },
  queue_empty: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignQueue,
    label: "Add contacts",
  },
  bulk_sender_misaligned: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.onboarding,
    label: "Set up a bulk sender",
  },
  script_required: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignContent,
    label: "Edit content",
  },
  script_unavailable: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignContent,
    label: "Replace script",
  },
  audio_unavailable: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignContent,
    label: "Replace audio",
  },
  message_content_required: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignContent,
    label: "Add message content",
  },
  campaign_ended: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignQueue,
    label: "Update campaign dates",
  },
  send_window_required: {
    type: "route",
    template: CAMPAIGN_READINESS_ROUTE_TEMPLATES.campaignQueue,
    label: "Set send hours",
  },
} as const satisfies Record<
  CampaignReadinessCode,
  CampaignReadinessCorrectiveAction
>;

export function getCampaignReadinessAction(
  code: CampaignReadinessCode,
): CampaignReadinessCorrectiveAction {
  return CAMPAIGN_READINESS_ACTIONS[code];
}

export function resolveCampaignReadinessRoute(
  action: CampaignReadinessCorrectiveAction,
  context: { workspaceId: string; campaignId: string | number },
): string | null {
  switch (action.type) {
    case "scroll":
      return null;
    case "route":
      return action.template
        .replace(":workspaceId", encodeURIComponent(context.workspaceId))
        .replace(":campaignId", encodeURIComponent(String(context.campaignId)));
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
