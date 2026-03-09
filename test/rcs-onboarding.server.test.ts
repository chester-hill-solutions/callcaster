import { describe, expect, test } from "vitest";

import { DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE, mergeWorkspaceMessagingOnboardingState } from "../app/lib/messaging-onboarding.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
} from "../app/lib/rcs-onboarding.server";

describe("RCS onboarding helpers", () => {
  test("hydrates the RCS draft from saved business details", () => {
    const hydrated = hydrateWorkspaceRcsOnboardingState(
      mergeWorkspaceMessagingOnboardingState(DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE, {
        selectedChannels: ["rcs"],
        businessProfile: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile,
          legalBusinessName: "Acme Health",
          supportEmail: "support@acme.test",
          useCaseSummary: "We send appointment reminders and follow-up updates.",
        },
        emergencyVoice: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
          address: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice.address,
            countryCode: "CA",
          },
        },
      }),
    );

    expect(hydrated.rcs.displayName).toBe("Acme Health");
    expect(hydrated.rcs.publicDescription).toBe(
      "We send appointment reminders and follow-up updates.",
    );
    expect(hydrated.rcs.notificationEmail).toBe("support@acme.test");
    expect(hydrated.rcs.representativeEmail).toBe("support@acme.test");
    expect(hydrated.rcs.regions).toEqual(["Canada"]);
    expect(hydrated.messagingService.supportedChannels).toContain("rcs");
    expect(hydrated.rcs.status).toBe("provisioning");
  });

  test("reports only the remaining manual RCS submission gaps", () => {
    const hydrated = hydrateWorkspaceRcsOnboardingState(
      mergeWorkspaceMessagingOnboardingState(DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE, {
        selectedChannels: ["rcs"],
        businessProfile: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile,
          legalBusinessName: "Acme Health",
          websiteUrl: "https://acme.test",
          privacyPolicyUrl: "https://acme.test/privacy",
          termsOfServiceUrl: "https://acme.test/terms",
          supportEmail: "support@acme.test",
          useCaseSummary: "We send appointment reminders and follow-up updates.",
          optInWorkflow: "Customers opt in during scheduling.",
          sampleMessages: ["Acme Health: Your visit is tomorrow at 9:30 AM."],
        },
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      }),
    );

    const issues = getWorkspaceRcsBlockingIssues(hydrated);

    expect(issues).not.toContain("Add the RCS sender display name.");
    expect(issues).not.toContain("Add the public RCS sender description.");
    expect(issues).not.toContain("Add the RCS notification email.");
    expect(issues).toContain("Add the authorized representative name.");
    expect(issues).toContain("Upload a square logo image URL for the sender package.");
  });
});
