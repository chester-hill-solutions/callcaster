import type { CampaignType } from "@/lib/db-types";
import type { WorkspaceOnboardingGoal } from "@/lib/types";

/**
 * The one customer-facing name for the robocall / IVR campaign goal (#1347).
 * Internal enum values (`robocall`, `simple_ivr`, `complex_ivr`) and API
 * fields are unchanged; only copy reads from here. "Advanced IVR" stays a
 * distinct, technical label for the simple/complex IVR builders.
 */
export const AUTOMATED_PHONE_MENU_LABEL = "Automated phone menu";

export const CAMPAIGN_PRODUCT_GOAL_VALUES = [
  "live_calling",
  "text_campaign",
  "automated_phone_menu",
] as const;

export type CampaignProductGoal =
  (typeof CAMPAIGN_PRODUCT_GOAL_VALUES)[number];

export type CampaignProductGoalOption = {
  id: CampaignProductGoal;
  label: string;
  description: string;
};

export const CAMPAIGN_PRODUCT_GOAL_OPTIONS = [
  {
    id: "live_calling",
    label: "Live calling",
    description: "Connect callers with contacts for live conversations.",
  },
  {
    id: "text_campaign",
    label: "Text campaign",
    description: "Send text outreach to a campaign audience.",
  },
  {
    id: "automated_phone_menu",
    label: AUTOMATED_PHONE_MENU_LABEL,
    description: "Play automated prompts and collect responses by phone.",
  },
] as const satisfies readonly CampaignProductGoalOption[];

/** Translate a product-level goal to the canonical backend campaign enum. */
export function campaignTypeForProductGoal(
  goal: CampaignProductGoal,
): CampaignType {
  switch (goal) {
    case "live_calling":
      return "live_call";
    case "text_campaign":
      return "message";
    case "automated_phone_menu":
      return "robocall";
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}

/** Collapse backend campaign variants into their product-level goal. */
export function productGoalForCampaignType(
  campaignType: CampaignType,
): CampaignProductGoal | null {
  switch (campaignType) {
    case "live_call":
      return "live_calling";
    case "message":
      return "text_campaign";
    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      return "automated_phone_menu";
    case "email":
      return null;
    default: {
      const _exhaustive: never = campaignType;
      return _exhaustive;
    }
  }
}

/** Translate the existing onboarding vocabulary into product-level goals. */
export function productGoalForOnboardingGoal(
  onboardingGoal: WorkspaceOnboardingGoal,
): CampaignProductGoal | null {
  switch (onboardingGoal) {
    case "live_call":
      return "live_calling";
    case "sms_blast":
      return "text_campaign";
    case "ivr":
      return "automated_phone_menu";
    case "rent_number":
      // Number-only path has no campaign product goal.
      return null;
    default: {
      const _exhaustive: never = onboardingGoal;
      return _exhaustive;
    }
  }
}
