import { describe, expect, test } from "vitest";
import { deriveWorkspaceMessagingReadiness } from "@/lib/messaging-onboarding-display";
import { DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE } from "@/lib/messaging-onboarding.server";

describe("messaging-onboarding-display", () => {
  test("deriveWorkspaceMessagingReadiness warns when messaging is not provisioned", () => {
    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      workspaceNumbers: [],
      recentOutboundCount: 0,
    });

    expect(readiness.shouldRedirectToOnboarding).toBe(true);
    expect(readiness.warnings[0]).toContain("Messaging Service");
  });
});
