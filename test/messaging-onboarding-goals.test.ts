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
    expect(channelsForOnboardingGoal("rent_number", "CA")).toEqual(["local_number"]);
  });

  test("maps SMS blast by operating country", () => {
    expect(channelsForOnboardingGoal("sms_blast", "CA")).toEqual(["toll_free_bulk_sms"]);
    expect(channelsForOnboardingGoal("sms_blast", "US")).toEqual(["a2p10dlc"]);
    expect(channelsForOnboardingGoal("sms_blast", "BOTH")).toEqual([
      "toll_free_bulk_sms",
      "a2p10dlc",
    ]);
  });

  test("builds goal-first wizard order with SMS program only for sms_blast", () => {
    expect(checklistStepsForGoal("live_call")).toEqual([
      "audience",
      "first_number",
      "campaign_info",
      "credits",
      "launch_checks",
    ]);
    expect(checklistStepsForGoal("ivr")).toContain("script");
    expect(checklistStepsForGoal("rent_number")).toEqual([
      "first_number",
      "credits",
      "launch_checks",
    ]);
    expect(wizardStepsForGoal("sms_blast")[0]).toBe("path_selection");
    expect(wizardStepsForGoal("sms_blast")[1]).toBe("business_identity");
    expect(wizardStepsForGoal("sms_blast")[2]).toBe("business_program");
    expect(wizardStepsForGoal("live_call")).not.toContain("business_program");
    expect(wizardStepsForGoal("rent_number")[0]).toBe("path_selection");
    expect(wizardStepsForGoal("rent_number")).not.toContain("audience");
  });

  test("advances past first number according to goal", () => {
    expect(nextWizardStep("first_number", "live_call")).toBe("campaign_info");
    expect(nextWizardStep("first_number", "ivr")).toBe("script");
    expect(nextWizardStep("first_number", "rent_number")).toBe("credits");
    expect(nextWizardStep("path_selection", "sms_blast")).toBe("business_identity");
  });
});
