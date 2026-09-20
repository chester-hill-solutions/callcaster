import { describe, expect, test } from "vitest";

import { CAMPAIGN_PRODUCT_GOAL_OPTIONS } from "@/lib/campaign-goals";
import { ONBOARDING_GOAL_OPTIONS } from "@/lib/messaging-onboarding/goals";
import { campaignTypeText } from "@/lib/utils";

// The one customer-facing name (pinned literal, #1925): a same-string rename
// of the shared constant must fail this contract test, not echo it.
const CUSTOMER_FACING_LABEL = "Automated phone menu";

/**
 * Terminology contract (#1347): the robocall / IVR goal has exactly one
 * customer-facing name across goal selection, onboarding, and campaign labels.
 */
describe("automated phone menu terminology", () => {
  test("goal selection, onboarding, and the legacy type label agree", () => {
    const productGoal = CAMPAIGN_PRODUCT_GOAL_OPTIONS.find((g) => g.id === "automated_phone_menu");
    const onboardingGoal = ONBOARDING_GOAL_OPTIONS.find((g) => g.id === "ivr");
    expect(productGoal?.label).toBe(CUSTOMER_FACING_LABEL);
    expect(onboardingGoal?.label).toBe(CUSTOMER_FACING_LABEL);
    expect(campaignTypeText("robocall")).toBe(CUSTOMER_FACING_LABEL);
  });

  test("Advanced IVR stays a distinct technical label", () => {
    expect(campaignTypeText("simple_ivr")).toBe("Simple IVR");
    expect(campaignTypeText("complex_ivr")).toBe("Complex IVR");
    expect(CUSTOMER_FACING_LABEL).not.toMatch(/IVR/);
  });
});
