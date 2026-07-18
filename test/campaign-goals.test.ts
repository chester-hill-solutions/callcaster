import { describe, expect, test } from "vitest";

import type { CampaignType } from "../app/lib/db-types";
import type { WorkspaceOnboardingGoal } from "../app/lib/types";
import {
  CAMPAIGN_PRODUCT_GOAL_OPTIONS,
  CAMPAIGN_PRODUCT_GOAL_VALUES,
  campaignTypeForProductGoal,
  productGoalForCampaignType,
  productGoalForOnboardingGoal,
} from "../app/lib/campaign-goals";

describe("app/lib/campaign-goals.ts", () => {
  test("maps every product goal to its canonical backend campaign type", () => {
    expect(
      Object.fromEntries(
        CAMPAIGN_PRODUCT_GOAL_VALUES.map((goal) => [
          goal,
          campaignTypeForProductGoal(goal),
        ]),
      ),
    ).toEqual({
      live_calling: "live_call",
      text_campaign: "message",
      automated_phone_menu: "robocall",
    });
  });

  test("maps every backend campaign type to a product goal or null", () => {
    const campaignTypes: CampaignType[] = [
      "message",
      "robocall",
      "simple_ivr",
      "complex_ivr",
      "live_call",
      "email",
    ];

    expect(
      Object.fromEntries(
        campaignTypes.map((campaignType) => [
          campaignType,
          productGoalForCampaignType(campaignType),
        ]),
      ),
    ).toEqual({
      message: "text_campaign",
      robocall: "automated_phone_menu",
      simple_ivr: "automated_phone_menu",
      complex_ivr: "automated_phone_menu",
      live_call: "live_calling",
      email: null,
    });
  });

  test("explicitly translates every onboarding goal", () => {
    const onboardingGoals: WorkspaceOnboardingGoal[] = [
      "live_call",
      "ivr",
      "sms_blast",
    ];

    expect(
      Object.fromEntries(
        onboardingGoals.map((goal) => [goal, productGoalForOnboardingGoal(goal)]),
      ),
    ).toEqual({
      live_call: "live_calling",
      ivr: "automated_phone_menu",
      sms_blast: "text_campaign",
    });
  });

  test("provides one complete metadata option per product goal", () => {
    expect(CAMPAIGN_PRODUCT_GOAL_OPTIONS.map((option) => option.id)).toEqual(
      CAMPAIGN_PRODUCT_GOAL_VALUES,
    );
    expect(
      CAMPAIGN_PRODUCT_GOAL_OPTIONS.every(
        (option) => option.label.length > 0 && option.description.length > 0,
      ),
    ).toBe(true);
  });
});
