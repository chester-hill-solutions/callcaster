import { describe, expect, test, vi } from "vitest";

import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  normalizeWorkspaceMessagingOnboardingState,
  updateMessagingServiceSenders,
  updateWorkspaceMessagingOnboardingState,
} from "../app/lib/messaging-onboarding.server";

function makeSupabase(
  twilioData: unknown,
  options?: { selectError?: unknown; updateError?: unknown },
) {
  const updateEq = vi.fn(async () => ({ error: options?.updateError ?? null }));
  return {
    from: vi.fn((table: string) => {
      if (table !== "workspace") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn(async () => ({
              data: { twilio_data: twilioData },
              error: options?.selectError ?? null,
            })),
          }),
        }),
        update: () => ({ eq: updateEq }),
      };
    }),
    _updateEq: updateEq,
  };
}

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
      workspaceNumbers: [
        { type: "caller_id", phone_number: "+15551234567", capabilities: null },
      ],
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
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice
              .address,
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
      workspaceNumbers: [
        { type: "rented", phone_number: "+15550000000", capabilities: null },
      ],
      recentOutboundCount: 0,
    });

    expect(readiness.messagingReady).toBe(true);
    expect(readiness.voiceReady).toBe(true);
    expect(readiness.sendMode).toBe("messaging_service");
    expect(steps.at(-1)?.status).toBe("complete");
  });

  test("normalizes malformed state fields to safe defaults", () => {
    const malformed = normalizeWorkspaceMessagingOnboardingState({
      version: "1",
      status: "invalid",
      selectedChannels: ["rcs", "invalid-channel", 4],
      steps: [{ id: "", label: "", status: "bad", description: 4 }],
      businessProfile: null,
      messagingService: {
        desiredSendMode: "from_number",
        stickySenderEnabled: "yes",
        advancedOptOutEnabled: "yes",
        supportedChannels: ["a2p10dlc", "bad"],
      },
      subaccountBootstrap: { authMode: "invalid" },
      emergencyVoice: {
        enabled: "bad",
        address: { countryCode: "", status: "invalid" },
      },
      a2p10dlc: { status: "invalid" },
      rcs: { status: "invalid" },
      reviewState: { blockingIssues: ["ok", 2] },
      lastUpdatedBy: 44,
    });

    expect(malformed.status).toBe("not_started");
    expect(malformed.selectedChannels).toEqual(["rcs"]);
    expect(malformed.steps).toHaveLength(6);
    expect(malformed.messagingService.desiredSendMode).toBe("from_number");
    expect(malformed.messagingService.stickySenderEnabled).toBe(true);
    expect(malformed.subaccountBootstrap.authMode).toBe("mixed");
    expect(malformed.emergencyVoice.enabled).toBe(false);
    expect(malformed.emergencyVoice.address.countryCode).toBe("US");
    expect(malformed.a2p10dlc.status).toBe("not_started");
    expect(malformed.rcs.status).toBe("not_started");
    expect(malformed.reviewState.blockingIssues).toEqual(["ok"]);
    expect(malformed.lastUpdatedBy).toBeNull();
  });

  test("getWorkspaceMessagingOnboardingFromTwilioData handles non-record input", () => {
    const fromNull = getWorkspaceMessagingOnboardingFromTwilioData(null as any);
    const fromPrimitive = getWorkspaceMessagingOnboardingFromTwilioData(
      "bad" as any,
    );

    expect(fromNull.currentStep).toBe("business_profile");
    expect(fromPrimitive.selectedChannels).toEqual([
      "a2p10dlc",
      "voice_compliance",
    ]);
  });

  test("mergeWorkspaceMessagingOnboardingState preserves nested arrays unless overridden", () => {
    const merged = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          attachedSenderPhoneNumbers: ["+15550000000"],
          supportedChannels: ["a2p10dlc"],
        },
        subaccountBootstrap: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap,
          createdResources: ["messaging-service"],
          featureFlags: ["sticky_sender"],
          driftMessages: ["drift"],
        },
        emergencyVoice: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
          emergencyEligiblePhoneNumbers: ["+15550000001"],
          ineligibleCallerIds: ["+15550000002"],
          allowedCallerIdTypes: ["rented", "caller_id"],
          address: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice
              .address,
            city: "Toronto",
          },
        },
        reviewState: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.reviewState,
          blockingIssues: ["issue"],
        },
      },
    );

    const untouched = mergeWorkspaceMessagingOnboardingState(merged, {
      businessProfile: { legalBusinessName: "Acme" },
    });

    expect(untouched.messagingService.attachedSenderPhoneNumbers).toEqual([
      "+15550000000",
    ]);
    expect(untouched.subaccountBootstrap.createdResources).toEqual([
      "messaging-service",
    ]);
    expect(untouched.emergencyVoice.address.city).toBe("Toronto");
    expect(untouched.reviewState.blockingIssues).toEqual(["issue"]);
  });

  test("updateMessagingServiceSenders deduplicates and ignores empty values", () => {
    const state = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          attachedSenderPhoneNumbers: ["+15550000000", ""],
        },
      },
    );

    const result = updateMessagingServiceSenders(state, "+15550000000");
    expect(result.messagingService.attachedSenderPhoneNumbers).toEqual([
      "+15550000000",
    ]);
  });

  test("get/update workspace onboarding state read and write through Supabase", async () => {
    const supabase = makeSupabase({
      onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
    });

    const loaded = await getWorkspaceMessagingOnboardingState({
      supabaseClient: supabase as any,
      workspaceId: "w1",
    });
    expect(loaded.currentStep).toBe("business_profile");

    const updated = await updateWorkspaceMessagingOnboardingState({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      updates: {
        status: "collecting_business",
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      },
      actorUserId: "u1",
    });

    expect(updated.status).toBe("collecting_business");
    expect(updated.lastUpdatedBy).toBe("u1");
    expect(updated.lastUpdatedAt).toMatch(/T/);
    expect(supabase._updateEq).toHaveBeenCalled();
  });

  test("get/update workspace onboarding propagate Supabase errors", async () => {
    await expect(
      getWorkspaceMessagingOnboardingState({
        supabaseClient: makeSupabase(
          {},
          { selectError: new Error("select failed") },
        ) as any,
        workspaceId: "w1",
      }),
    ).rejects.toThrow("select failed");

    await expect(
      updateWorkspaceMessagingOnboardingState({
        supabaseClient: makeSupabase(
          {},
          { updateError: new Error("update failed") },
        ) as any,
        workspaceId: "w1",
        updates: {},
        actorUserId: null,
      }),
    ).rejects.toThrow("update failed");
  });
});
