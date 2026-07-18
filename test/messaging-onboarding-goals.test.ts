import { describe, expect, test } from "vitest";
import {
  channelsForOnboardingGoal,
  checklistStepsForGoal,
  nextWizardStep,
  wizardStepsForGoal,
} from "@/lib/messaging-onboarding/goals";

describe("messaging onboarding goals", () => {
  test("maps live call and IVR to local number channels", () => {
    expect(channelsForOnboardingGoal("live_call", "CA")).toEqual([
      "local_number",
      "voice_compliance",
    ]);
    expect(channelsForOnboardingGoal("ivr", "US")).toEqual(["local_number"]);
  });

  test("maps SMS blast by operating country", () => {
    expect(channelsForOnboardingGoal("sms_blast", "CA")).toEqual(["toll_free_bulk_sms"]);
    expect(channelsForOnboardingGoal("sms_blast", "US")).toEqual(["a2p10dlc"]);
    expect(channelsForOnboardingGoal("sms_blast", "BOTH")).toEqual([
      "toll_free_bulk_sms",
      "a2p10dlc",
    ]);
  });

  test("builds goal-specific checklist order", () => {
    expect(checklistStepsForGoal("live_call")).toEqual([
      "audience",
      "first_number",
      "campaign_info",
      "credits",
      "launch_checks",
    ]);
    expect(checklistStepsForGoal("ivr")).toContain("script");
    expect(wizardStepsForGoal("sms_blast")[0]).toBe("business_profile");
    expect(wizardStepsForGoal("sms_blast")[1]).toBe("path_selection");
  });

  test("advances past first number according to goal", () => {
    expect(nextWizardStep("first_number", "live_call")).toBe("campaign_info");
    expect(nextWizardStep("first_number", "ivr")).toBe("script");
  });
});
