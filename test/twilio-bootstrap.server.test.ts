import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createService: vi.fn(),
  logger: { error: vi.fn() },
  baseUrl: vi.fn(() => "https://base.example"),
}));

vi.mock("twilio", () => ({
  default: {
    Twilio: function () {
      return {
        messaging: {
          v1: {
            services: {
              create: (...args: any[]) => mocks.createService(...args),
            },
          },
        },
      };
    },
  },
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BASE_URL: () => mocks.baseUrl(),
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

function makeOnboarding(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    status: "not_started",
    currentStep: "business_profile",
    selectedChannels: ["a2p10dlc", "voice_compliance"],
    steps: [],
    businessProfile: {
      legalBusinessName: "Acme",
      businessType: "llc",
      websiteUrl: "https://acme.test",
      privacyPolicyUrl: "https://acme.test/privacy",
      termsOfServiceUrl: "https://acme.test/terms",
      supportEmail: "support@acme.test",
      supportPhone: "+15550000000",
      useCaseSummary: "Summary",
      optInWorkflow: "Users opt in",
      optInKeywords: "START",
      optOutKeywords: "STOP",
      helpKeywords: "HELP",
      sampleMessages: ["sample"],
    },
    messagingService: {
      desiredSendMode: "messaging_service",
      serviceSid: null,
      friendlyName: null,
      provisioningStatus: "not_started",
      attachedSenderPhoneNumbers: [],
      supportedChannels: [],
      stickySenderEnabled: true,
      advancedOptOutEnabled: true,
      lastProvisionedAt: null,
      lastError: null,
    },
    subaccountBootstrap: {
      status: "not_started",
      authMode: "mixed",
      callbackBaseUrl: null,
      inboundVoiceUrl: null,
      inboundSmsUrl: null,
      statusCallbackUrl: null,
      createdResources: [],
      featureFlags: [],
      driftMessages: [],
      lastSyncedAt: null,
      lastError: null,
    },
    emergencyVoice: {
      status: "not_started",
      enabled: false,
      emergencyEligiblePhoneNumbers: [],
      ineligibleCallerIds: [],
      allowedCallerIdTypes: ["rented"],
      complianceNotes: "",
      address: {
        addressSid: null,
        customerName: "",
        street: "",
        city: "",
        region: "",
        postalCode: "",
        countryCode: "US",
        status: "not_started",
        validationError: null,
        lastValidatedAt: null,
      },
      lastReviewedAt: null,
    },
    a2p10dlc: {
      status: "not_started",
      brandSid: null,
      campaignSid: null,
      trustProductSid: null,
      customerProfileBundleSid: null,
      brandType: null,
      tcrId: null,
      rejectionReason: null,
      lastSubmittedAt: null,
      lastSyncedAt: null,
    },
    rcs: {
      status: "not_started",
      provider: null,
      agentId: null,
      senderId: null,
      displayName: "",
      publicDescription: "",
      logoImageUrl: "",
      bannerImageUrl: "",
      accentColor: "",
      optInPolicyImageUrl: "",
      useCaseVideoUrl: "",
      representativeName: "",
      representativeTitle: "",
      representativeEmail: "",
      notificationEmail: "",
      regions: [],
      prerequisites: [],
      notes: "",
      lastSubmittedAt: null,
      lastSyncedAt: null,
    },
    reviewState: {
      blockingIssues: [],
      lastError: null,
      lastUpdatedAt: null,
    },
    lastUpdatedAt: null,
    lastUpdatedBy: null,
    ...overrides,
  };
}

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
              data: { id: "w1", name: "Workspace", twilio_data: twilioData },
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

describe("twilio-bootstrap server", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createService.mockReset();
    mocks.logger.error.mockReset();
    mocks.baseUrl.mockReturnValue("https://base.example");
  });

  test("ensureWorkspaceTwilioBootstrap provisions Messaging Service when missing", async () => {
    mocks.createService.mockResolvedValue({
      sid: "MG123",
      friendlyName: "Svc",
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.createService).toHaveBeenCalled();
    expect(result.messagingService.serviceSid).toBe("MG123");
    expect(result.subaccountBootstrap.status).toBe("live");
    expect(result.currentStep).toBe("business_profile");
    expect(supabase._updateEq).toHaveBeenCalled();
  });

  test("ensureWorkspaceTwilioBootstrap skips create when service already exists", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding({
        status: "collecting_business",
        currentStep: "provider_provisioning",
        messagingService: {
          ...makeOnboarding().messagingService,
          serviceSid: "MG_EXISTING",
        },
      }),
    });

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: null,
    });

    expect(mocks.createService).not.toHaveBeenCalled();
    expect(result.messagingService.serviceSid).toBe("MG_EXISTING");
    expect(result.currentStep).toBe("business_profile");
  });

  test("ensureWorkspaceTwilioBootstrap captures bootstrap failure details", async () => {
    mocks.createService.mockRejectedValueOnce(new Error("create failed"));
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u2",
    });

    expect(result.subaccountBootstrap.status).toBe("rejected");
    expect(result.subaccountBootstrap.lastError).toBe("create failed");
    expect(result.reviewState.lastError).toBe("create failed");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("ensureWorkspaceTwilioBootstrap throws on missing creds and query/update errors", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");

    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        supabaseClient: makeSupabase({ onboarding: makeOnboarding() }) as any,
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("Workspace is missing Twilio account credentials");

    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        supabaseClient: makeSupabase(
          {},
          { selectError: new Error("select failed") },
        ) as any,
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("select failed");

    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        supabaseClient: makeSupabase(
          { sid: "AC123", authToken: "token", onboarding: makeOnboarding() },
          { updateError: new Error("update failed") },
        ) as any,
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("update failed");
  });

  test("syncWorkspaceTwilioBootstrapState updates drift based on service presence", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const withService = await mod.syncWorkspaceTwilioBootstrapState({
      supabaseClient: makeSupabase({
        sid: "AC123",
        authToken: "token",
        onboarding: makeOnboarding({
          messagingService: {
            ...makeOnboarding().messagingService,
            serviceSid: "MG123",
          },
        }),
      }) as any,
      workspaceId: "w1",
    });
    expect(withService.subaccountBootstrap.status).toBe("live");
    expect(withService.subaccountBootstrap.driftMessages).toEqual([]);

    const withoutService = await mod.syncWorkspaceTwilioBootstrapState({
      supabaseClient: makeSupabase({
        sid: "AC123",
        authToken: "token",
        onboarding: makeOnboarding(),
      }) as any,
      workspaceId: "w1",
    });
    expect(withoutService.subaccountBootstrap.driftMessages).toContain(
      "Messaging Service is missing from the expected bootstrap resources.",
    );
  });

  test("ensureWorkspaceTwilioBootstrap keeps provisioning when service create has no sid", async () => {
    mocks.createService.mockResolvedValue({ sid: "   ", friendlyName: "   " });
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.status).toBe("provisioning");
    expect(result.currentStep).toBe("messaging_service");
    expect(result.messagingService.serviceSid).toBeNull();
    expect(result.messagingService.friendlyName).toBe("Workspace Messaging");
    expect(result.messagingService.lastError).toBeNull();
    expect(result.subaccountBootstrap.createdResources).toEqual([
      "messaging_service:   ",
    ]);
  });

  test("ensureWorkspaceTwilioBootstrap stores unknown error for non-Error throws", async () => {
    mocks.createService.mockRejectedValueOnce("boom");
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: null,
    });

    expect(result.subaccountBootstrap.lastError).toBe(
      "Unknown bootstrap failure",
    );
    expect(result.reviewState.lastError).toBe("Unknown bootstrap failure");
  });

  test("syncWorkspaceTwilioBootstrapState throws select errors", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");

    await expect(
      mod.syncWorkspaceTwilioBootstrapState({
        supabaseClient: makeSupabase(
          {},
          { selectError: new Error("select failed") },
        ) as any,
        workspaceId: "w1",
      }),
    ).rejects.toThrow("select failed");
  });

  test("syncWorkspaceTwilioBootstrapState handles non-record twilio_data", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");
    const supabase = makeSupabase(null);

    const result = await mod.syncWorkspaceTwilioBootstrapState({
      supabaseClient: supabase as any,
      workspaceId: "w1",
    });

    expect(result.subaccountBootstrap.status).toBe("not_started");
    expect(result.subaccountBootstrap.driftMessages).toContain(
      "Messaging Service is missing from the expected bootstrap resources.",
    );
    expect(supabase._updateEq).toHaveBeenCalled();
  });
});
