import { describe, expect, test, vi } from "vitest";

const twilioDataMocks = vi.hoisted(() => ({
  data: {} as unknown,
  persist: vi.fn(async (_client: unknown, _workspaceId: string, next: unknown) => {
    twilioDataMocks.data = next;
  }),
}));

vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: vi.fn(async () => twilioDataMocks.data),
  persistWorkspaceTwilioData: (...args: unknown[]) => twilioDataMocks.persist(...args),
}));

// These cases document the pre-RCS (flag-off) behavior; the flag-on paths are
// covered by test/rcs-onboarding.server.test.ts. Pin the flag so flipping the
// production default doesn't rewrite this suite's meaning.
vi.mock("@/lib/rcs-onboarding-flags", () => ({
  RCS_ONBOARDING_ENABLED: false,
  isRcsOnboardingEnabled: () => false,
}));

import {
  applyWorkspaceOnboardingChannelPolicy,
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  normalizeWorkspaceMessagingOnboardingState,
  updateMessagingServiceSenders,
  updateWorkspaceMessagingOnboardingState,
  WORKSPACE_MESSAGING_ONBOARDING_VERSION,
} from "../app/lib/messaging-onboarding.server";

describe("messaging onboarding helpers", () => {
  test("normalizes a complete default onboarding state", () => {
    const state = normalizeWorkspaceMessagingOnboardingState(null);

    expect(state.selectedChannels).toEqual([]);
    expect(state.messagingService.desiredSendMode).toBe("messaging_service");
    expect(state.emergencyVoice.address.status).toBe("not_started");
    expect(state.steps).toHaveLength(8);
    expect(state.selectedGoal).toBeNull();
    expect(state.steps.some((step) => step.id === "first_number")).toBe(true);
    expect(state.steps.some((step) => step.id === "audience")).toBe(true);
  });

  test("derives onboarding readiness for new workspaces and legacy workspaces", () => {
    const state = normalizeWorkspaceMessagingOnboardingState(null);

    const newWorkspaceReadiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [],
      recentOutboundCount: 0,
    });
    // Fresh workspaces without business basics + goal redirect into onboarding.
    expect(newWorkspaceReadiness.shouldRedirectToOnboarding).toBe(true);
    expect(newWorkspaceReadiness.legacyMode).toBe(false);
    expect(newWorkspaceReadiness.sendMode).toBe("from_number");
    expect(newWorkspaceReadiness.warnings).toContain("No phone number yet.");

    const intakeCompleteState = mergeWorkspaceMessagingOnboardingState(state, {
      status: "collecting_business",
      selectedGoal: "live_call",
      selectedChannels: ["local_number", "voice_compliance"],
      businessProfile: {
        ...state.businessProfile,
        legalBusinessName: "Acme Health",
        websiteUrl: "https://acme.example",
        useCaseSummary: "Appointment reminders for patients.",
        sampleMessages: ["Your appointment is tomorrow."],
      },
    });
    const afterIntake = deriveWorkspaceMessagingReadiness({
      onboarding: intakeCompleteState,
      workspaceNumbers: [],
      recentOutboundCount: 0,
      launchContext: {
        audienceCount: 0,
        scriptCount: 0,
        campaignCount: 0,
        creditsBalance: 0,
      },
    });
    // Missing number no longer force-redirects after business + goal.
    expect(afterIntake.shouldRedirectToOnboarding).toBe(false);
    expect(afterIntake.shouldShowOnboardingBanner).toBe(true);

    // NOTE: the profile above includes useCaseSummary/sampleMessages, which the
    // wizard only ever collects for the SMS goal. That is why this assertion
    // kept passing while non-SMS customers were trapped — see the dedicated
    // test below, which supplies only what the Identity screen can produce.

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
      "Only verified caller IDs are present. Outbound is supported, but inbound SMS and calls require a rented number.",
    );
  });

  test("does not redirect a workspace with real message history but zero current numbers", () => {
    // Regression test: a workspace that has released/lost its numbers but has
    // genuine outbound message history should still be classified as legacy
    // (and therefore not force-redirected into onboarding), matching the
    // "real message history but zero current numbers" bug this guards
    // against.
    const state = normalizeWorkspaceMessagingOnboardingState(null);

    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [],
      recentOutboundCount: 12,
    });

    expect(readiness.legacyMode).toBe(true);
    expect(readiness.shouldRedirectToOnboarding).toBe(false);
  });

  test("counts verified caller IDs as first-number readiness", () => {
    const state = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      },
    );
    const verifiedCallerId = {
      type: "caller_id",
      phone_number: "+15551234567",
      capabilities: { verification_status: "success" },
    };
    const pendingCallerId = {
      type: "caller_id",
      phone_number: "+15559876543",
      capabilities: { verification_status: "pending" },
    };

    const withVerified = buildOnboardingStepsForState(state, { hasFirstNumber: true });
    const withoutVerified = buildOnboardingStepsForState(state, { hasFirstNumber: false });

    expect(withVerified.find((step) => step.id === "first_number")?.status).toBe("complete");
    expect(withoutVerified.find((step) => step.id === "first_number")?.status).toBe("in_progress");

    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: { ...state, steps: withVerified },
      workspaceNumbers: [verifiedCallerId],
      recentOutboundCount: 0,
    });
    expect(readiness.warnings).not.toContain("No phone number yet.");

    const pendingReadiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [pendingCallerId],
      recentOutboundCount: 0,
    });
    expect(pendingReadiness.warnings).toContain("No phone number yet.");
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
    const steps = buildOnboardingStepsForState(nextState, {
      hasFirstNumber: true,
      audienceCount: 1,
      campaignCount: 1,
      creditsBalance: 100,
    });
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
    expect(malformed.steps).toHaveLength(8);
    expect(malformed.messagingService.desiredSendMode).toBe("from_number");
    expect(malformed.messagingService.stickySenderEnabled).toBe(true);
    expect(malformed.subaccountBootstrap.authMode).toBe("mixed");
    expect(malformed.emergencyVoice.enabled).toBe(false);
    expect(malformed.emergencyVoice.address.countryCode).toBe("CA");
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

    expect(fromNull.currentStep).toBe("business_identity");
    expect(fromPrimitive.selectedChannels).toEqual([]);
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

  test("get/update workspace onboarding state read and write through Postgres", async () => {
    twilioDataMocks.data = {
      onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
    };
    twilioDataMocks.persist.mockClear();

    const loaded = await getWorkspaceMessagingOnboardingState({
      workspaceId: "w1",
    });
    expect(loaded.currentStep).toBe("business_identity");

    const updated = await updateWorkspaceMessagingOnboardingState({
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
    expect(twilioDataMocks.persist).toHaveBeenCalled();
  });

  test("applyWorkspaceOnboardingChannelPolicy strips rcs from selected channels", () => {
    const state = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        selectedChannels: ["rcs", "a2p10dlc"],
      },
    );

    const adjusted = applyWorkspaceOnboardingChannelPolicy(state);

    expect(adjusted.selectedChannels).toEqual(["a2p10dlc"]);
  });

  test("goal checklist omits script for live call and keeps it for IVR", () => {
    const liveCall = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      { selectedGoal: "live_call", selectedChannels: ["local_number", "voice_compliance"] },
    );
    const ivr = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      { selectedGoal: "ivr", selectedChannels: ["local_number"] },
    );

    const liveSteps = buildOnboardingStepsForState(liveCall, { hasFirstNumber: true });
    const ivrSteps = buildOnboardingStepsForState(ivr, { hasFirstNumber: true });

    expect(liveSteps.find((step) => step.id === "script")).toBeUndefined();
    expect(ivrSteps.find((step) => step.id === "script")?.status).toBe("in_progress");
    expect(liveSteps).toHaveLength(7);
    expect(ivrSteps).toHaveLength(8);
  });

  test("rent_number checklist omits audience/script/campaign and launch ignores them", () => {
    const rentNumber = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        selectedGoal: "rent_number",
        selectedChannels: ["local_number"],
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      },
    );

    const steps = buildOnboardingStepsForState(rentNumber, {
      hasFirstNumber: true,
      audienceCount: 0,
      campaignCount: 0,
      creditsBalance: 10,
    });

    expect(steps.find((step) => step.id === "audience")).toBeUndefined();
    expect(steps.find((step) => step.id === "script")).toBeUndefined();
    expect(steps.find((step) => step.id === "campaign_info")).toBeUndefined();
    expect(steps.map((step) => step.id)).toEqual([
      "business_profile",
      "path_selection",
      "first_number",
      "credits",
      "launch_checks",
    ]);
    expect(steps.find((step) => step.id === "launch_checks")?.status).toBe("complete");
  });

  test("marks first_number complete when hasFirstNumber is true", () => {
    const state = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      },
    );

    const withoutNumber = buildOnboardingStepsForState(state, { hasFirstNumber: false });
    const withNumber = buildOnboardingStepsForState(state, { hasFirstNumber: true });

    expect(withoutNumber.find((step) => step.id === "first_number")?.status).toBe(
      "in_progress",
    );
    expect(withNumber.find((step) => step.id === "first_number")?.status).toBe(
      "complete",
    );
  });

  test("recomputes steps from state and ignores stored steps", () => {
    const legacySteps = DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.steps.filter(
      (step) => step.id !== "first_number",
    );
    const normalized = normalizeWorkspaceMessagingOnboardingState({
      ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      steps: legacySteps,
    });

    expect(normalized.steps).toHaveLength(8);
    expect(normalized.steps.find((step) => step.id === "first_number")?.label).toBe(
      "Phone number",
    );
    expect(normalized.selectedGoal).toBeNull();
  });

  test("get/update workspace onboarding propagate Postgres errors", async () => {
    const { loadWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    vi.mocked(loadWorkspaceTwilioData).mockRejectedValueOnce(new Error("select failed"));

    await expect(
      getWorkspaceMessagingOnboardingState({
        workspaceId: "w1",
      }),
    ).rejects.toThrow("select failed");

    twilioDataMocks.data = { onboarding: DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE };
    twilioDataMocks.persist.mockRejectedValueOnce(new Error("update failed"));

    await expect(
      updateWorkspaceMessagingOnboardingState({
        workspaceId: "w1",
        updates: {},
        actorUserId: null,
      }),
    ).rejects.toThrow("update failed");
  });

  test("merge preserves top-level status and currentStep on partial update", () => {
    const merged = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        status: "collecting_business",
        currentStep: "messaging_service",
      },
    );

    expect(merged.status).toBe("collecting_business");
    expect(merged.currentStep).toBe("messaging_service");
    expect(merged.businessProfile.legalBusinessName).toBe("");
  });

  test("normalizes malformed partial onboarding input safely", () => {
    const state = normalizeWorkspaceMessagingOnboardingState({
      version: "not-a-number",
      status: "bogus",
      businessProfile: { legalBusinessName: 123 },
      messagingService: null,
      unknownSection: { foo: "bar" },
    });

    expect(state.version).toBe(WORKSPACE_MESSAGING_ONBOARDING_VERSION);
    expect(state.status).toBe("not_started");
    expect(state.businessProfile.legalBusinessName).toBe("");
    expect(state.messagingService.desiredSendMode).toBe("messaging_service");
    expect(state.steps.length).toBeGreaterThan(0);
  });

  test("deriveWorkspaceMessagingReadiness warns on incomplete A2P for US businesses", () => {
    const state = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        operatingCountry: "US",
        selectedChannels: ["a2p10dlc"],
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
        emergencyVoice: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
          address: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice.address,
            countryCode: "US",
          },
        },
      },
    );

    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding: state,
      workspaceNumbers: [{ type: "rented", phone_number: "+15550000000" }],
      recentOutboundCount: 0,
    });

    expect(readiness.warnings).toContain("A2P 10DLC registration is not approved yet.");
  });
});

/**
 * Regression guard for the onboarding trap.
 *
 * The intake gate demanded four business-profile fields while the Identity
 * screen collects two, and the screen collecting the other two is shown only
 * for the SMS goal. Every calling / IVR / rent-a-number workspace therefore
 * failed the gate forever and was bounced back into the wizard.
 *
 * These cases deliberately supply ONLY what the Identity screen can produce —
 * the mistake in the pre-existing coverage was hand-building a profile the UI
 * could never generate, which is why it stayed green through the outage.
 */
describe("intake completes with only what the Identity screen collects", () => {
  const nonSmsGoals = ["live_call", "ivr", "rent_number"] as const;

  for (const goal of nonSmsGoals) {
    test(`${goal}: identity fields alone clear the redirect gate`, () => {
      const base = normalizeWorkspaceMessagingOnboardingState(null);
      const onboarding = mergeWorkspaceMessagingOnboardingState(base, {
        status: "collecting_business",
        selectedGoal: goal,
        businessProfile: {
          ...base.businessProfile,
          legalBusinessName: "Acme Health",
          websiteUrl: "https://acme.example",
          // No useCaseSummary, no sampleMessages: the wizard never asks a
          // non-SMS workspace for them.
        },
      });

      const readiness = deriveWorkspaceMessagingReadiness({
        onboarding,
        // No numbers and no traffic: the "Skip for now" path, which is the
        // case that had no escape at all.
        workspaceNumbers: [],
        recentOutboundCount: 0,
      });

      expect(readiness.shouldRedirectToOnboarding).toBe(false);
    });
  }

  test("a workspace with no goal still goes to onboarding", () => {
    const base = normalizeWorkspaceMessagingOnboardingState(null);
    const onboarding = mergeWorkspaceMessagingOnboardingState(base, {
      status: "collecting_business",
      businessProfile: {
        ...base.businessProfile,
        legalBusinessName: "Acme Health",
        websiteUrl: "https://acme.example",
      },
    });

    const readiness = deriveWorkspaceMessagingReadiness({
      onboarding,
      workspaceNumbers: [],
      recentOutboundCount: 0,
    });

    expect(readiness.shouldRedirectToOnboarding).toBe(true);
  });
});
