import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  fetchService: vi.fn(),
  listNumbers: vi.fn(async () => []),
  auditWebhooks: vi.fn(async () => ({
    workspaceId: "w1",
    driftMessages: [],
    entries: [],
    ivrRuntimeHint: "unknown" as const,
    smsStatusCanonical: "edge" as const,
  })),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  baseUrl: vi.fn(() => "https://base.example"),
}));

const adminDbMocks = vi.hoisted(() => ({
  workspace: { id: "w1", name: "Workspace", twilio_data: {} as any },
  updateCalls: [] as any[],
  selectError: null as unknown | null,
  updateError: null as unknown | null,
}));

const adminDb = vi.hoisted(() => {
  const readRows = async () => {
    if (adminDbMocks.selectError) throw adminDbMocks.selectError;
    return [adminDbMocks.workspace];
  };
  // `.where()` is followed by `.limit()` (plain load) or `.for("update").limit()`
  // (the atomic merge transaction) — support both chains.
  const afterWhere: any = { limit: readRows, for: () => ({ limit: readRows }) };
  const client: any = {
    updateCalls: adminDbMocks.updateCalls,
    select: () => ({ from: () => ({ where: () => afterWhere }) }),
    update: () => ({
      set: (set: any) => ({
        where: async () => {
          if (adminDbMocks.updateError) throw adminDbMocks.updateError;
          adminDbMocks.updateCalls.push(set);
          if (set.twilio_data != null) {
            adminDbMocks.workspace.twilio_data =
              typeof set.twilio_data === "string"
                ? JSON.parse(set.twilio_data)
                : set.twilio_data;
          }
        },
      }),
    }),
    query: {
      workspace: {
        findFirst: async () => {
          if (adminDbMocks.selectError) throw adminDbMocks.selectError;
          return adminDbMocks.workspace;
        },
      },
    },
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(client),
  };
  return client;
});

vi.mock("@/server/admin-db", () => ({ adminDb }));

vi.mock("@/lib/twilio-webhook-audit.server", () => ({
  auditWorkspaceTwilioWebhooks: (...args: any[]) => mocks.auditWebhooks(...args),
}));

vi.mock("twilio", () => ({
  default: {
    Twilio: function () {
      const serviceContext = {
        update: (...args: any[]) => mocks.updateService(...args),
        fetch: (...args: any[]) => mocks.fetchService(...args),
        phoneNumbers: {
          list: async () => [],
          create: async () => ({}),
        },
      };
      const services = Object.assign(
        (_sid?: string) => serviceContext,
        {
          create: (...args: any[]) => mocks.createService(...args),
        },
      );
      return {
        messaging: {
          v1: {
            services,
          },
        },
        incomingPhoneNumbers: {
          list: (...args: any[]) => mocks.listNumbers(...args),
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
    currentStep: "business_identity",
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

function setWorkspaceTwilioData(twilioData: unknown) {
  adminDbMocks.workspace.twilio_data = twilioData;
}

function setWorkspaceCredentials(key = "AKtest", token = "secret") {
  adminDbMocks.workspace.key = key;
  adminDbMocks.workspace.token = token;
}

describe("twilio-bootstrap server", () => {
  beforeEach(() => {
    vi.resetModules();
    adminDbMocks.workspace = { id: "w1", name: "Workspace", twilio_data: {} };
    setWorkspaceCredentials();
    adminDb.updateCalls.length = 0;
    adminDbMocks.selectError = null;
    adminDbMocks.updateError = null;
    mocks.createService.mockReset();
    mocks.updateService.mockReset();
    mocks.updateService.mockResolvedValue({});
    mocks.fetchService.mockReset();
    mocks.fetchService.mockResolvedValue({
      statusCallback: "https://base.example/api/caller-id/status",
    });
    mocks.listNumbers.mockReset();
    mocks.listNumbers.mockResolvedValue([]);
    mocks.auditWebhooks.mockReset();
    mocks.auditWebhooks.mockResolvedValue({
      workspaceId: "w1",
      driftMessages: [],
      entries: [],
      ivrRuntimeHint: "unknown",
      smsStatusCanonical: "edge",
    });
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
    mocks.baseUrl.mockReturnValue("https://base.example");
  });

  test("ensureWorkspaceTwilioBootstrap provisions Messaging Service when missing", async () => {
    mocks.createService.mockResolvedValue({
      sid: "MG123",
      friendlyName: "Svc",
    });
    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.createService).toHaveBeenCalled();
    expect(result.outcome).toBe("success");
    expect(result.onboarding.messagingService.serviceSid).toBe("MG123");
    expect(result.onboarding.subaccountBootstrap.status).toBe("live");
    // Bootstrap must not fast-forward the wizard: a fresh workspace stays on
    // business_identity so the user starts at step 1.
    expect(result.onboarding.currentStep).toBe("business_identity");
    expect(adminDb.updateCalls.length).toBeGreaterThan(0);
  });

  test("ensureWorkspaceTwilioBootstrap advances only the legacy messaging_service step", async () => {
    mocks.createService.mockResolvedValue({
      sid: "MG123",
      friendlyName: "Svc",
    });
    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding({ currentStep: "messaging_service" }),
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.onboarding.currentStep).toBe("first_number");
  });

  test("ensureWorkspaceTwilioBootstrap skips create when service already exists", async () => {
    setWorkspaceTwilioData({
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
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: null,
    });

    expect(mocks.createService).not.toHaveBeenCalled();
    expect(result.onboarding.messagingService.serviceSid).toBe("MG_EXISTING");
    // A user already on a later step must not be pulled back/forward by a re-run.
    expect(result.onboarding.currentStep).toBe("provider_provisioning");
  });

  test("ensureWorkspaceTwilioBootstrap captures bootstrap failure details", async () => {
    mocks.createService.mockRejectedValueOnce(new Error("create failed"));
    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: "u2",
    });

    expect(result.outcome).toBe("failed");
    expect(result.onboarding.subaccountBootstrap.status).toBe("rejected");
    expect(result.onboarding.reviewState.lastError).toBe("create failed");
    expect(result.onboarding.subaccountBootstrap.lastError).toBeTruthy();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("ensureWorkspaceTwilioBootstrap throws on missing creds and query/update errors", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");

    setWorkspaceTwilioData({ onboarding: makeOnboarding() });
    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("Workspace is missing Twilio account credentials");

    adminDbMocks.selectError = new Error("select failed");
    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("select failed");
    adminDbMocks.selectError = null;

    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    adminDbMocks.updateError = new Error("update failed");
    await expect(
      mod.ensureWorkspaceTwilioBootstrap({
        workspaceId: "w1",
        actorUserId: null,
      }),
    ).rejects.toThrow("update failed");
    adminDbMocks.updateError = null;
  });

  test("syncWorkspaceTwilioBootstrapState updates drift based on service presence", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");

    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding({
        messagingService: {
          ...makeOnboarding().messagingService,
          serviceSid: "MG123",
        },
      }),
    });
    const withService = await mod.syncWorkspaceTwilioBootstrapState({
      workspaceId: "w1",
    });
    expect(withService.subaccountBootstrap.status).toBe("live");
    expect(withService.subaccountBootstrap.driftMessages).toEqual([]);

    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    const withoutService = await mod.syncWorkspaceTwilioBootstrapState({
      workspaceId: "w1",
    });
    expect(withoutService.subaccountBootstrap.driftMessages).toContain(
      "Messaging Service is missing from the expected bootstrap resources.",
    );
  });

  test("ensureWorkspaceTwilioBootstrap keeps provisioning when service create has no sid", async () => {
    mocks.createService.mockResolvedValue({ sid: "   ", friendlyName: "   " });
    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.outcome).toBe("failed");
    expect(result.onboarding.status).toBe("provisioning");
    expect(result.onboarding.currentStep).toBe("messaging_service");
    expect(result.onboarding.messagingService.serviceSid).toBeNull();
    expect(result.onboarding.messagingService.friendlyName).toBe("Workspace Messaging");
    expect(result.onboarding.messagingService.lastError).toBe(
      "Messaging Service could not be created automatically.",
    );
  });

  test("ensureWorkspaceTwilioBootstrap stores unknown error for non-Error throws", async () => {
    mocks.createService.mockRejectedValueOnce("boom");
    setWorkspaceTwilioData({
      sid: "AC123",
      authToken: "token",
      onboarding: makeOnboarding(),
    });
    const mod = await import("../app/lib/twilio-bootstrap.server");

    const result = await mod.ensureWorkspaceTwilioBootstrap({
      workspaceId: "w1",
      actorUserId: null,
    });

    expect(result.outcome).toBe("failed");
    expect(result.onboarding.subaccountBootstrap.lastError).toBeTruthy();
    expect(result.onboarding.reviewState.lastError).toBeTruthy();
  });

  test("syncWorkspaceTwilioBootstrapState throws select errors", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");
    adminDbMocks.selectError = new Error("select failed");
    await expect(
      mod.syncWorkspaceTwilioBootstrapState({
        workspaceId: "w1",
      }),
    ).rejects.toThrow("select failed");
    adminDbMocks.selectError = null;
  });

  test("syncWorkspaceTwilioBootstrapState handles non-record twilio_data", async () => {
    const mod = await import("../app/lib/twilio-bootstrap.server");
    setWorkspaceTwilioData(null);

    const result = await mod.syncWorkspaceTwilioBootstrapState({
      workspaceId: "w1",
    });

    expect(result.subaccountBootstrap.status).toBe("not_started");
    expect(result.subaccountBootstrap.driftMessages).toContain(
      "Messaging Service is missing from the expected bootstrap resources.",
    );
    expect(adminDb.updateCalls.length).toBeGreaterThan(0);
  });
});
