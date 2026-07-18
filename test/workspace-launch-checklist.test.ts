import { describe, expect, test } from "vitest";
import { isWorkspaceIntakeComplete } from "@/lib/messaging-onboarding/intake";
import {
  buildWorkspaceLaunchChecklist,
  launchChecklistProgress,
  launchChecklistPrimaryHref,
} from "@/lib/workspace-launch-checklist";
import type { WorkspaceMessagingBusinessProfile } from "@/lib/types";

const emptyProfile: WorkspaceMessagingBusinessProfile = {
  legalBusinessName: "",
  businessType: "",
  websiteUrl: "",
  privacyPolicyUrl: "",
  termsOfServiceUrl: "",
  supportEmail: "",
  supportPhone: "",
  useCaseSummary: "",
  optInWorkflow: "",
  optInKeywords: "",
  optOutKeywords: "",
  helpKeywords: "",
  sampleMessages: [],
  doingBusinessAs: "",
  businessRegistrationNumber: "",
  ageGatedContent: false,
  ein: "",
  industry: "",
  authorizedRepName: "",
  authorizedRepEmail: "",
  authorizedRepPhone: "",
  authorizedRepTitle: "",
};

const completeProfile: WorkspaceMessagingBusinessProfile = {
  ...emptyProfile,
  legalBusinessName: "Acme Health",
  websiteUrl: "https://acme.example",
  useCaseSummary: "Appointment reminders.",
  sampleMessages: ["Your appointment is tomorrow."],
};

describe("isWorkspaceIntakeComplete", () => {
  test("requires started status, business baseline, and a selected goal", () => {
    expect(
      isWorkspaceIntakeComplete({
        status: "not_started",
        selectedGoal: null,
        businessProfile: completeProfile,
      }),
    ).toBe(false);
    expect(
      isWorkspaceIntakeComplete({
        status: "collecting_business",
        selectedGoal: "live_call",
        businessProfile: emptyProfile,
      }),
    ).toBe(false);
    expect(
      isWorkspaceIntakeComplete({
        status: "collecting_business",
        selectedGoal: null,
        businessProfile: completeProfile,
      }),
    ).toBe(false);
    expect(
      isWorkspaceIntakeComplete({
        status: "collecting_business",
        selectedGoal: "live_call",
        businessProfile: completeProfile,
      }),
    ).toBe(true);
  });
});

describe("buildWorkspaceLaunchChecklist", () => {
  test("omits script for live_call and includes it for ivr", () => {
    const live = buildWorkspaceLaunchChecklist({
      workspaceId: "ws-1",
      onboarding: { selectedGoal: "live_call", status: "collecting_business" },
      audienceCount: 0,
      scriptCount: 0,
      campaignCount: 0,
      creditsBalance: 0,
      workspaceNumbers: [],
    });
    expect(live.some((item) => item.id === "script")).toBe(false);

    const ivr = buildWorkspaceLaunchChecklist({
      workspaceId: "ws-1",
      onboarding: { selectedGoal: "ivr", status: "collecting_business" },
      audienceCount: 1,
      scriptCount: 0,
      campaignCount: 0,
      creditsBalance: 10,
      workspaceNumbers: [{ type: "rented" }],
    });
    expect(ivr.find((item) => item.id === "script")?.complete).toBe(false);
    expect(ivr.find((item) => item.id === "credits")?.due).toBe("warning");
  });

  test("primary href opens the next incomplete onboarding wizard step", () => {
    const items = buildWorkspaceLaunchChecklist({
      workspaceId: "ws-1",
      onboarding: { selectedGoal: "sms_blast", status: "collecting_business" },
      audienceCount: 1,
      scriptCount: 1,
      campaignCount: 0,
      creditsBalance: 50,
      workspaceNumbers: [{ type: "rented" }],
    });
    expect(launchChecklistProgress(items).nextItem?.id).toBe("campaign");
    expect(launchChecklistPrimaryHref(items, "ws-1", "sms_blast")).toBe(
      "/workspaces/ws-1/onboarding?step=campaign_info",
    );
  });
});
