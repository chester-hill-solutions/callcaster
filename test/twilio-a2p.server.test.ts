import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureWorkspaceTwilioBootstrap: vi.fn(),
  logger: { error: vi.fn() },
  brandCreate: vi.fn(),
  campaignCreate: vi.fn(),
}));

vi.mock("../app/lib/twilio-bootstrap.server", () => ({
  ensureWorkspaceTwilioBootstrap: (...args: any[]) => mocks.ensureWorkspaceTwilioBootstrap(...args),
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

function makeSupabase(twilioData: any) {
  const updateEq = vi.fn(async () => ({ error: null }));
  return {
    from: vi.fn((table: string) => {
      if (table !== "workspace") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn(async () => ({
              data: { id: "w1", name: "Workspace", twilio_data: twilioData },
              error: null,
            })),
          }),
        }),
        update: () => ({
          eq: updateEq,
        }),
      };
    }),
    _updateEq: updateEq,
  };
}

describe("twilio A2P service", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ensureWorkspaceTwilioBootstrap.mockReset();
    mocks.logger.error.mockReset();
    mocks.brandCreate.mockReset();
    mocks.campaignCreate.mockReset();
    mocks.ensureWorkspaceTwilioBootstrap.mockResolvedValue(undefined);
  });

  test("stores blocking issues when required business information is missing", async () => {
    const supabase = makeSupabase(
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
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(result.reviewState.blockingIssues.length).toBeGreaterThan(0);
    expect(result.a2p10dlc.status).toBe("collecting_business");
    expect(supabase._updateEq).toHaveBeenCalled();
  });

  test("creates brand and campaign resources when Twilio APIs are available", async () => {
    mocks.brandCreate.mockResolvedValueOnce({ sid: "BN123" });
    mocks.campaignCreate.mockResolvedValueOnce({ sid: "CP123" });

    const supabase = makeSupabase(makeWorkspaceTwilioData());
    const mod = await import("../app/lib/twilio-a2p.server");

    const result = await mod.provisionWorkspaceA2P({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u1",
    });

    expect(mocks.brandCreate).toHaveBeenCalled();
    expect(mocks.campaignCreate).toHaveBeenCalled();
    expect(result.a2p10dlc.brandSid).toBe("BN123");
    expect(result.a2p10dlc.campaignSid).toBe("CP123");
    expect(result.a2p10dlc.status).toBe("in_review");
  });
});
