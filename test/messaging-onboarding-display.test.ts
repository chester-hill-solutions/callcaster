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
    expect(readiness.warnings.some((warning) => warning.includes("Messaging Service"))).toBe(
      true,
    );
    expect(readiness.warnings).toContain("No phone number yet.");
  });

  test("does not warn about missing phone number when verified caller ID exists", () => {
    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      workspaceNumbers: [
        {
          type: "caller_id",
          phone_number: "+15551234567",
          capabilities: { verification_status: "success" },
        },
      ],
      recentOutboundCount: 0,
    });

    expect(readiness.warnings).not.toContain("No phone number yet.");
    expect(readiness.warnings).toContain(
      "Only verified caller IDs are present. Outbound is supported, but inbound SMS and calls require a rented number.",
    );
  });
});
