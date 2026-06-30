import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureWorkspaceTwilioBootstrap: vi.fn(async () => ({
    outcome: "success",
    serviceSid: "MG_TEST",
    lastError: null,
    createdResources: [],
    driftMessages: [],
    onboarding: {},
  })),
  logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  brandCreate: vi.fn(),
  campaignCreate: vi.fn(),
  twilioData: {} as Record<string, unknown>,
  loadError: null as Error | null,
  persistError: null as Error | null,
  persistCalls: [] as unknown[],
  twilioInstanceError: null as Error | null,
}));

vi.mock("../app/lib/twilio-bootstrap.server", () => ({
  ensureWorkspaceTwilioBootstrap: (...args: any[]) =>
    mocks.ensureWorkspaceTwilioBootstrap(...args),
}));

vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: vi.fn(async () => {
    if (mocks.loadError) {
      throw mocks.loadError;
    }
    return mocks.twilioData;
  }),
  persistWorkspaceTwilioData: vi.fn(async (_client: unknown, _workspaceId: string, data: unknown) => {
    if (mocks.persistError) {
      throw mocks.persistError;
    }
    mocks.persistCalls.push(data);
  }),
}));

vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(async () => {
    if (mocks.twilioInstanceError) {
      throw mocks.twilioInstanceError;
    }
    return {
      messaging: {
        v1: {
          brandRegistrations: {
            create: (...args: any[]) => mocks.brandCreate(...args),
          },
          campaigns: {
            create: (...args: any[]) => mocks.campaignCreate(...args),
          },
        },
      },
    };
  }),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

vi.mock("twilio", () => ({
  default: {
    Twilio: function () {
      return {
        messaging: {
          v1: {
            brandRegistrations: {
              create: (...args: any[]) => mocks.brandCreate(...args),
            },
            campaigns: {
              create: (...args: any[]) => mocks.campaignCreate(...args),
            },
          },
        },
      };
    },
  },
}));

function makeWorkspaceTwilioData(overrides: Record<string, unknown> = {}) {
  return {
    sid: "AC123",
    authToken: "auth",
    onboarding: {
      version: 1,
      status: "collecting_business",
      currentStep: "provider_provisioning",
      selectedChannels: ["a2p10dlc", "voice_compliance"],
      steps: [],
      businessProfile: {
        legalBusinessName: "Acme Inc",
        businessType: "llc",
        websiteUrl: "https://acme.test",
        privacyPolicyUrl: "https://acme.test/privacy",
        termsOfServiceUrl: "https://acme.test/terms",
        supportEmail: "support@acme.test",
        supportPhone: "+15550000000",
        useCaseSummary: "Appointment reminders",
        optInWorkflow: "Users opt in on the website.",
        optInKeywords: "START",
        optOutKeywords: "STOP",
        helpKeywords: "HELP",
        sampleMessages: ["Acme reminder"],
      },
      messagingService: {
        desiredSendMode: "messaging_service",
        serviceSid: "MG123",
        friendlyName: "Acme Messaging",
        provisioningStatus: "live",
        attachedSenderPhoneNumbers: [],
        supportedChannels: ["a2p10dlc"],
        stickySenderEnabled: true,
        advancedOptOutEnabled: true,
        lastProvisionedAt: null,
        lastError: null,
      },
      subaccountBootstrap: {
        status: "live",
        authMode: "mixed",
        callbackBaseUrl: "http://base",
        inboundVoiceUrl: "http://base/api/inbound",
        inboundSmsUrl: "http://base/api/inbound-sms",
        statusCallbackUrl: "http://base/api/caller-id/status",
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
        status: "collecting_business",
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
    },
  };
}

function configureTwilioData(
  twilioData: unknown,
  options?: { selectError?: unknown; updateError?: unknown },
) {
  mocks.twilioData = (twilioData ?? {}) as Record<string, unknown>;
  mocks.loadError = options?.selectError instanceof Error ? options.selectError : null;
  mocks.persistError = options?.updateError instanceof Error ? options.updateError : null;
  return {} as const;
}

describe("twilio A2P service", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ensureWorkspaceTwilioBootstrap.mockReset();
    mocks.logger.error.mockReset();
    mocks.brandCreate.mockReset();
    mocks.campaignCreate.mockReset();
    mocks.twilioData = {};
    mocks.loadError = null;
    mocks.persistError = null;
    mocks.persistCalls = [];
    mocks.twilioInstanceError = null;
    mocks.ensureWorkspaceTwilioBootstrap.mockImplementation(async () => {
      const data = makeWorkspaceTwilioData();
      return {
        outcome: "success" as const,
        serviceSid: "MG123",
        lastError: null,
        createdResources: [],
        driftMessages: [],
        onboarding: data.onboarding,
      };
    });
  });

  test("stores blocking issues when required business information is missing", async () => {
    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        businessProfile: {
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
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.reviewState.blockingIssues.length).toBeGreaterThan(0);
    expect(result.a2p10dlc.status).toBe("collecting_business");
    expect(mocks.persistCalls.length).toBeGreaterThan(0);
  });

  test("creates brand and campaign resources when Twilio APIs are available", async () => {
    mocks.brandCreate.mockResolvedValueOnce({ sid: "BN123" });
    mocks.campaignCreate.mockResolvedValueOnce({ sid: "CP123" });

    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        a2p10dlc: {
          status: "collecting_business",
          brandSid: null,
          campaignSid: null,
          trustProductSid: "BU123",
          customerProfileBundleSid: "BU456",
          brandType: null,
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.brandCreate).toHaveBeenCalled();
    expect(mocks.campaignCreate).toHaveBeenCalled();
    expect(result.a2p10dlc.brandSid).toBe("BN123");
    expect(result.a2p10dlc.campaignSid).toBe("CP123");
    expect(result.a2p10dlc.status).toBe("in_review");
  });

  test("syncWorkspaceA2PStatus updates onboarding sync timestamp", async () => {
    const client = configureTwilioData(makeWorkspaceTwilioData());
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.syncWorkspaceA2PStatus({
            workspaceId: "w1",
    });

    expect(result.a2p10dlc.lastSyncedAt).toMatch(/T/);
    expect(mocks.persistCalls.length).toBeGreaterThan(0);
  });

  test("throws when workspace is missing Twilio credentials", async () => {
    configureTwilioData({
      onboarding: makeWorkspaceTwilioData().onboarding,
    });
    mocks.twilioInstanceError = new Error("Workspace missing Twilio credentials");
    const mod = await import("../app/lib/twilio-a2p.server");

    await expect(
      mod.provisionWorkspaceA2P({
        null: {} as any,
        workspaceId: "w1",
        actorUserId: "u1",
      }),
    ).rejects.toThrow("Workspace missing Twilio credentials");
  });

  test("throws when auth token is missing even if sid exists", async () => {
    configureTwilioData({
      sid: "AC123",
      onboarding: makeWorkspaceTwilioData().onboarding,
    });
    mocks.twilioInstanceError = new Error("Workspace missing Twilio credentials");
    const mod = await import("../app/lib/twilio-a2p.server");

    await expect(
      mod.syncWorkspaceA2PStatus({
        null: {} as any,
        workspaceId: "w1",
      }),
    ).rejects.toThrow("Workspace missing Twilio credentials");
  });

  test("throws when workspace twilio_data is null", async () => {
    configureTwilioData(null);
    mocks.twilioInstanceError = new Error("Workspace missing Twilio credentials");
    const mod = await import("../app/lib/twilio-a2p.server");

    await expect(
      mod.syncWorkspaceA2PStatus({
        null: {} as any,
        workspaceId: "w1",
      }),
    ).rejects.toThrow("Workspace missing Twilio credentials");
  });

  test("marks onboarding rejected when Twilio throws an Error", async () => {
    mocks.brandCreate.mockRejectedValueOnce(new Error("Twilio failed"));

    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        a2p10dlc: {
          status: "collecting_business",
          brandSid: null,
          campaignSid: null,
          trustProductSid: "BU123",
          customerProfileBundleSid: "BU456",
          brandType: null,
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.status).toBe("rejected");
    expect(result.a2p10dlc.status).toBe("rejected");
    expect(result.a2p10dlc.rejectionReason).toBe("Twilio failed");
    expect(result.reviewState.lastError).toBe("Twilio failed");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("stores unknown error message for non-Error throws", async () => {
    mocks.brandCreate.mockRejectedValueOnce("bad");

    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        a2p10dlc: {
          status: "collecting_business",
          brandSid: null,
          campaignSid: null,
          trustProductSid: "BU123",
          customerProfileBundleSid: "BU456",
          brandType: null,
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: null,
    });

    expect(result.a2p10dlc.rejectionReason).toBe("Unknown A2P error");
    expect(result.reviewState.lastError).toBe("Unknown A2P error");
  });

  test("throws select and update errors from Postgres", async () => {
    const selectError = new Error("select failed");
    const updateError = new Error("update failed");
    const base = makeWorkspaceTwilioData();
    const mod = await import("../app/lib/twilio-a2p.server");

    await expect(
      mod.provisionWorkspaceA2P({
                workspaceId: "w1",
        actorUserId: "u1",
      }),
    ).rejects.toThrow("select failed");

    await expect(
      mod.syncWorkspaceA2PStatus({
                workspaceId: "w1",
      }),
    ).rejects.toThrow("update failed");
  });

  test("skips brand create when brand exists and trims campaign sid", async () => {
    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        a2p10dlc: {
          status: "collecting_business",
          brandSid: "BN_EXISTING",
          campaignSid: null,
          trustProductSid: "BU123",
          customerProfileBundleSid: "BU456",
          brandType: "sole_proprietor",
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
      }),
    );
    mocks.campaignCreate.mockResolvedValueOnce({ sid: "  CP_TRIM  " });
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.brandCreate).not.toHaveBeenCalled();
    expect(mocks.campaignCreate).toHaveBeenCalled();
    expect(result.a2p10dlc.brandSid).toBe("BN_EXISTING");
    expect(result.a2p10dlc.campaignSid).toBe("CP_TRIM");
  });

  test("adds blocking issue when messaging service is missing", async () => {
    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        messagingService: {
          ...makeWorkspaceTwilioData().onboarding.messagingService,
          serviceSid: null,
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.reviewState.blockingIssues).toContain(
      "Messaging Service must be provisioned first.",
    );
    expect(result.status).toBe("collecting_business");
  });

  test("keeps onboarding in submitting when brand sid is not parseable", async () => {
    mocks.brandCreate.mockResolvedValueOnce({ sid: 12345 });

    const client = configureTwilioData(
      makeWorkspaceTwilioData({
        a2p10dlc: {
          status: "collecting_business",
          brandSid: null,
          campaignSid: null,
          trustProductSid: "BU123",
          customerProfileBundleSid: "BU456",
          brandType: "sole_proprietor",
          tcrId: null,
          rejectionReason: null,
          lastSubmittedAt: null,
          lastSyncedAt: null,
        },
      }),
    );
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
            workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.brandCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        brandType: "sole_proprietor",
      }),
    );
    expect(mocks.campaignCreate).not.toHaveBeenCalled();
    expect(result.a2p10dlc.brandSid).toBeNull();
    expect(result.a2p10dlc.status).toBe("submitting");
  });
});
