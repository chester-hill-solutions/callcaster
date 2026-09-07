import { describe, expect, test } from "vitest";

import { AUTOMATED_PHONE_MENU_LABEL, CAMPAIGN_PRODUCT_GOAL_OPTIONS } from "@/lib/campaign-goals";
import { ONBOARDING_GOAL_OPTIONS } from "@/lib/messaging-onboarding/goals";
import { campaignTypeText } from "@/lib/utils";

/**
 * Terminology contract (#1347): the robocall / IVR goal has exactly one
 * customer-facing name across goal selection, onboarding, and campaign labels.
 */
describe("automated phone menu terminology", () => {
  test("goal selection, onboarding, and the legacy type label agree", () => {
    const productGoal = CAMPAIGN_PRODUCT_GOAL_OPTIONS.find((g) => g.id === "automated_phone_menu");
    const onboardingGoal = ONBOARDING_GOAL_OPTIONS.find((g) => g.id === "ivr");
    expect(productGoal?.label).toBe(AUTOMATED_PHONE_MENU_LABEL);
    expect(onboardingGoal?.label).toBe(AUTOMATED_PHONE_MENU_LABEL);
    expect(campaignTypeText("robocall")).toBe(AUTOMATED_PHONE_MENU_LABEL);
  });

  test("Advanced IVR stays a distinct technical label", () => {
    expect(campaignTypeText("simple_ivr")).toBe("Simple IVR");
    expect(campaignTypeText("complex_ivr")).toBe("Complex IVR");
    expect(AUTOMATED_PHONE_MENU_LABEL).not.toMatch(/IVR/);
  });
});
