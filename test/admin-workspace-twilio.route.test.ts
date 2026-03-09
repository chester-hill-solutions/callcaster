import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  updateWorkspaceTwilioPortalConfig: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  getWorkspaceTwilioPortalSnapshot: vi.fn(),
  syncWorkspaceTwilioSnapshot: vi.fn(),
  ensureWorkspaceTwilioBootstrap: vi.fn(),
  provisionWorkspaceA2P: vi.fn(),
  updateWorkspaceRcsOnboarding: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("../app/lib/database.server", () => ({
  updateWorkspaceTwilioPortalConfig: (...args: any[]) => mocks.updateWorkspaceTwilioPortalConfig(...args),
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  getWorkspaceTwilioPortalSnapshot: (...args: any[]) => mocks.getWorkspaceTwilioPortalSnapshot(...args),
  syncWorkspaceTwilioSnapshot: (...args: any[]) => mocks.syncWorkspaceTwilioSnapshot(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

vi.mock("../app/lib/twilio-bootstrap.server", () => ({
  ensureWorkspaceTwilioBootstrap: (...args: any[]) => mocks.ensureWorkspaceTwilioBootstrap(...args),
}));

vi.mock("../app/lib/twilio-a2p.server", () => ({
  provisionWorkspaceA2P: (...args: any[]) => mocks.provisionWorkspaceA2P(...args),
}));

vi.mock("../app/lib/rcs-onboarding.server", () => ({
  updateWorkspaceRcsOnboarding: (...args: any[]) => mocks.updateWorkspaceRcsOnboarding(...args),
  TWILIO_RCS_PROVIDER: "Twilio",
  TWILIO_RCS_DOCS_URL: "https://www.twilio.com/docs/rcs/onboarding",
  TWILIO_RCS_SENDERS_URL: "https://console.twilio.com/us1/develop/rcs/senders",
}));

function makePortalSnapshot() {
  return {
    onboarding: {
      status: "collecting_business",
      currentStep: "messaging_service",
      steps: [],
      messagingService: { serviceSid: null },
      rcs: {
        provider: "Twilio",
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
        notes: "",
        status: "not_started",
      },
    },
    readiness: {
      messagingReady: false,
      voiceReady: false,
      shouldShowOnboardingBanner: true,
      shouldRedirectToOnboarding: true,
      legacyMode: false,
      sendMode: "from_number",
      messagingServiceSid: null,
      selectedChannels: ["a2p10dlc"],
      currentStep: "messaging_service",
      warnings: ["Messaging Service has not been provisioned yet."],
    },
    config: {
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: false,
      defaultMessageIntent: null,
      sendMode: "from_number",
      messagingServiceSid: null,
      onboardingStatus: "not_started",
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    },
    detectedTrafficClass: "unknown",
    metrics: {
      recentOutboundCount: 0,
      rawFromCount: 0,
      messagingServiceCount: 0,
      statusCounts: {},
      numberTypes: [],
    },
    recommendations: [],
    supportRequestSummary: "summary",
    syncSnapshot: {
      accountStatus: null,
      accountFriendlyName: null,
      phoneNumberCount: 0,
      numberTypes: [],
      recentUsageCount: 0,
      usageTotalPrice: null,
      lastSyncedAt: null,
      lastSyncStatus: "never_synced",
      lastSyncError: null,
    },
  };
}

function makeSupabase(accessLevel: string, workspaceTwilioSid: string | null = null) {
  return {
    from: vi.fn((table: string) => {
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn(async () => ({
                data: { id: "u1", access_level: accessLevel, username: "ops@example.com" },
                error: null,
              })),
            }),
          }),
        };
      }

      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn(async () => ({
                data: workspaceTwilioSid ? { twilio_data: { sid: workspaceTwilioSid } } : { twilio_data: null },
                error: null,
              })),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/admin_.workspaces.$workspaceId.twilio.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    mocks.verifyAuth.mockReset();
    mocks.updateWorkspaceTwilioPortalConfig.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceTwilioPortalSnapshot.mockReset();
    mocks.syncWorkspaceTwilioSnapshot.mockReset();
    mocks.ensureWorkspaceTwilioBootstrap.mockReset();
    mocks.provisionWorkspaceA2P.mockReset();
    mocks.updateWorkspaceRcsOnboarding.mockReset();
    mocks.logger.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("action redirects non-sudo users", async () => {
    const supabaseClient = makeSupabase("admin");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const formData = new FormData();
    formData.set("_action", "update_twilio_portal");
    await expect(
      mod.action({
        request: new Request("http://x", { method: "POST", body: formData }),
        params: { workspaceId: "w1" },
      } as any),
    ).rejects.toMatchObject({ status: 302 });
  });

  test("action updates Twilio portal settings", async () => {
    const supabaseClient = makeSupabase("sudo");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.updateWorkspaceTwilioPortalConfig.mockResolvedValueOnce({});

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const formData = new FormData();
    formData.set("_action", "update_twilio_portal");
    formData.set("trafficClass", "toll_free");
    formData.set("throughputProduct", "market_throughput");
    formData.set("multiTenancyMode", "weighted");
    formData.set("sendMode", "messaging_service");
    formData.set("messagingServiceSid", "");
    formData.set("onboardingStatus", "requested");
    formData.set("defaultMessageIntent", "");
    formData.set("trafficShapingEnabled", "on");
    formData.set("supportNotes", "Need weighted capacity for launch week");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: formData }),
      params: { workspaceId: "w1" },
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.updateWorkspaceTwilioPortalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        actorUserId: "u1",
        actorUsername: "ops@example.com",
        updates: expect.objectContaining({
          trafficClass: "toll_free",
          throughputProduct: "market_throughput",
          multiTenancyMode: "weighted",
          sendMode: "messaging_service",
          messagingServiceSid: null,
          onboardingStatus: "requested",
          defaultMessageIntent: null,
          trafficShapingEnabled: true,
          supportNotes: "Need weighted capacity for launch week",
        }),
      }),
    );
  });

  test("action syncs workspace snapshot directly", async () => {
    const supabaseClient = makeSupabase("sudo");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.syncWorkspaceTwilioSnapshot.mockResolvedValueOnce({});

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const formData = new FormData();
    formData.set("_action", "sync_twilio_workspace");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: formData }),
      params: { workspaceId: "w1" },
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.syncWorkspaceTwilioSnapshot).toHaveBeenCalledWith({
      supabaseClient,
      workspaceId: "w1",
    });
  });

  test("action bootstraps workspace messaging", async () => {
    const supabaseClient = makeSupabase("sudo");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.ensureWorkspaceTwilioBootstrap.mockResolvedValueOnce({});

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const formData = new FormData();
    formData.set("_action", "bootstrap_workspace_messaging");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: formData }),
      params: { workspaceId: "w1" },
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.ensureWorkspaceTwilioBootstrap).toHaveBeenCalledWith({
      supabaseClient,
      workspaceId: "w1",
      actorUserId: "u1",
    });
  });

  test("action provisions workspace A2P and updates RCS state", async () => {
    const supabaseClient = makeSupabase("sudo");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.provisionWorkspaceA2P.mockResolvedValueOnce({});

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const provisionData = new FormData();
    provisionData.set("_action", "provision_workspace_a2p");
    const provisionRes = await mod.action({
      request: new Request("http://x", { method: "POST", body: provisionData }),
      params: { workspaceId: "w1" },
    } as any);
    expect(provisionRes.status).toBe(200);
    expect(mocks.provisionWorkspaceA2P).toHaveBeenCalledWith({
      supabaseClient,
      workspaceId: "w1",
      actorUserId: "u1",
    });

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.updateWorkspaceRcsOnboarding.mockResolvedValueOnce({});
    const rcsData = new FormData();
    rcsData.set("_action", "save_workspace_rcs");
    rcsData.set("rcsDisplayName", "Acme Support");
    rcsData.set("rcsPublicDescription", "Support conversations");
    rcsData.set("rcsLogoImageUrl", "https://example.com/logo.png");
    rcsData.set("rcsBannerImageUrl", "https://example.com/banner.png");
    rcsData.set("rcsAccentColor", "#0057FF");
    rcsData.set("rcsOptInPolicyImageUrl", "https://example.com/opt-in.png");
    rcsData.set("rcsUseCaseVideoUrl", "https://example.com/demo.mp4");
    rcsData.set("rcsRepresentativeName", "Jordan Smith");
    rcsData.set("rcsRepresentativeTitle", "Head of Operations");
    rcsData.set("rcsRepresentativeEmail", "jordan@example.com");
    rcsData.set("rcsNotificationEmail", "compliance@example.com");
    rcsData.set("rcsAgentId", "agent-123");
    rcsData.set("rcsSenderId", "sender-123");
    rcsData.set("rcsRegions", "US, CA");
    rcsData.set("rcsNotes", "beta");
    rcsData.set("rcsStatus", "in_review");
    const rcsRes = await mod.action({
      request: new Request("http://x", { method: "POST", body: rcsData }),
      params: { workspaceId: "w1" },
    } as any);
    expect(rcsRes.status).toBe(200);
    expect(mocks.updateWorkspaceRcsOnboarding).toHaveBeenCalledWith({
      supabaseClient,
      workspaceId: "w1",
      actorUserId: "u1",
      provider: "Twilio",
      displayName: "Acme Support",
      publicDescription: "Support conversations",
      logoImageUrl: "https://example.com/logo.png",
      bannerImageUrl: "https://example.com/banner.png",
      accentColor: "#0057FF",
      optInPolicyImageUrl: "https://example.com/opt-in.png",
      useCaseVideoUrl: "https://example.com/demo.mp4",
      representativeName: "Jordan Smith",
      representativeTitle: "Head of Operations",
      representativeEmail: "jordan@example.com",
      notificationEmail: "compliance@example.com",
      agentId: "agent-123",
      senderId: "sender-123",
      regions: ["US", "CA"],
      notes: "beta",
      status: "in_review",
    });
  });

  test("loadTwilioData requests usage records and maps them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"));

    const usageList = vi.fn().mockResolvedValue([
      {
        category: "sms-outbound",
        description: "SMS Outbound",
        usage: "10",
        usageUnit: "messages",
        price: 1.25,
        startDate: new Date("2026-02-05T00:00:00.000Z"),
        endDate: new Date("2026-03-06T00:00:00.000Z"),
      },
    ]);

    const supabaseClient = makeSupabase("sudo", "AC123");
    mocks.getWorkspaceTwilioPortalSnapshot.mockResolvedValueOnce(makePortalSnapshot());
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      api: {
        v2010: {
          accounts: () => ({
            fetch: vi.fn().mockResolvedValue({
              sid: "AC123",
              friendlyName: "Workspace",
              status: "active",
              type: "Full",
              dateCreated: new Date("2026-01-01T00:00:00.000Z"),
            }),
          }),
        },
      },
      incomingPhoneNumbers: {
        list: vi.fn().mockResolvedValue([]),
      },
      usage: {
        records: {
          list: usageList,
        },
      },
    });

    const mod = await import("../app/routes/admin_.workspaces.$workspaceId.twilio");
    const data = await mod.loadTwilioData(supabaseClient as any, "w1");

    expect(usageList).toHaveBeenCalledWith();
    expect(data.twilioUsage).toEqual([
      expect.objectContaining({
        category: "sms-outbound",
        price: "1.25",
        startDate: "2026-02-05T00:00:00.000Z",
        endDate: "2026-03-06T00:00:00.000Z",
      }),
    ]);
  });
});
