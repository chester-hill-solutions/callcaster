import { describe, expect, test } from "vitest";

import type { WorkspaceMessagingOnboardingState } from "../app/lib/types";
import { buildA2pBlockingIssues } from "../app/lib/twilio-a2p.server";
import { onboardingFixture } from "./fixtures/onboarding";

function makeOnboarding(
  overrides: {
    businessProfile?: Partial<WorkspaceMessagingOnboardingState["businessProfile"]>;
    messagingService?: Partial<WorkspaceMessagingOnboardingState["messagingService"]>;
    a2p10dlc?: Partial<WorkspaceMessagingOnboardingState["a2p10dlc"]>;
  } = {},
): WorkspaceMessagingOnboardingState {
  const base = onboardingFixture({
    operatingCountry: "US",
    selectedChannels: ["a2p10dlc"],
  });
  return {
    ...base,
    businessProfile: { ...base.businessProfile, ...overrides.businessProfile },
    messagingService: { ...base.messagingService, ...overrides.messagingService },
    a2p10dlc: { ...base.a2p10dlc, ...overrides.a2p10dlc },
  };
}

describe("twilio A2P service", () => {

  test("reports missing A2P business fields and Messaging Service setup", () => {
    const issues = buildA2pBlockingIssues(
      makeOnboarding({
        businessProfile: {
          legalBusinessName: "",
          websiteUrl: "",
          useCaseSummary: "",
          sampleMessages: [],
        },
        messagingService: { serviceSid: null },
      }),
    );

    expect(issues).toContain("Messaging Service must be provisioned first.");
    expect(issues.some((issue) => /legal business name/i.test(issue))).toBe(true);
  });

  test("clears setup blockers after required business fields and service are present", () => {
    const issues = buildA2pBlockingIssues(
      makeOnboarding({
        businessProfile: {
          legalBusinessName: "Acme Inc",
          websiteUrl: "https://acme.test",
          useCaseSummary: "Appointment reminders",
          sampleMessages: ["Your appointment is tomorrow."],
        },
        messagingService: { serviceSid: "MG123" },
        a2p10dlc: {
          customerProfileBundleSid: "BU123",
          trustProductSid: "BU456",
        },
      }),
    );

    expect(issues).toEqual([]);
  });
});
