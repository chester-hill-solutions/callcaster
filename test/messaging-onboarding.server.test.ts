import { describe, expect, test } from "vitest";

import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  deriveWorkspaceMessagingReadiness,
  mergeWorkspaceMessagingOnboardingState,
  normalizeWorkspaceMessagingOnboardingState,
} from "../app/lib/messaging-onboarding.server";

describe("messaging onboarding helpers", () => {
  test("normalizes a complete default onboarding state", () => {
    const state = normalizeWorkspaceMessagingOnboardingState(null);

    expect(state.selectedChannels).toEqual(["a2p10dlc", "voice_compliance"]);
    expect(state.messagingService.desiredSendMode).toBe("messaging_service");
    expect(state.emergencyVoice.address.status).toBe("not_started");
    expect(state.steps).toHaveLength(6);
  });

  test("derives onboarding readiness for new workspaces and legacy workspaces", () => {
    const state = normalizeWorkspaceMessagingOnboardingState(null);

    const newWorkspaceReadiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [],
      recentOutboundCount: 0,
    });
    expect(newWorkspaceReadiness.shouldRedirectToOnboarding).toBe(true);
    expect(newWorkspaceReadiness.legacyMode).toBe(false);
    expect(newWorkspaceReadiness.sendMode).toBe("from_number");

    const legacyWorkspaceReadiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [{ type: "caller_id", phone_number: "+15551234567", capabilities: null }],
      recentOutboundCount: 5,
    });
    expect(legacyWorkspaceReadiness.shouldRedirectToOnboarding).toBe(false);
    expect(legacyWorkspaceReadiness.legacyMode).toBe(true);
    expect(legacyWorkspaceReadiness.warnings).toContain(
      "Only verified caller IDs are present, so voice readiness remains limited.",
    );
  });

  test("marks Messaging Service and voice readiness when onboarding is configured", () => {
    const nextState = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
          provisioningStatus: "live",
        },
        emergencyVoice: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
          enabled: true,
          emergencyEligiblePhoneNumbers: ["+15550000000"],
          address: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice.address,
            status: "validated",
          },
        },
        a2p10dlc: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.a2p10dlc,
          status: "approved",
        },
      },
    );
    const steps = buildOnboardingStepsForState(nextState);
    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: { ...nextState, steps },
      workspaceNumbers: [{ type: "rented", phone_number: "+15550000000", capabilities: null }],
      recentOutboundCount: 0,
    });

    expect(readiness.messagingReady).toBe(true);
    expect(readiness.voiceReady).toBe(true);
    expect(readiness.sendMode).toBe("messaging_service");
    expect(steps.at(-1)?.status).toBe("complete");
  });
});
