import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Business profile save must not advance when required fields for the active
 * wizard screen (or the full baseline for API/capability posts) are blank.
 */

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspacePhoneNumbers: vi.fn(),
  getWorkspaceMessagingOnboardingState: vi.fn(),
  persistWorkspaceOnboardingState: vi.fn(),
  enqueueWorkspaceComplianceJob: vi.fn(),
  getWorkspaceCredits: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
  getWorkspacePhoneNumbers: (...args: unknown[]) => mocks.getWorkspacePhoneNumbers(...args),
}));

vi.mock("@/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...args: unknown[]) =>
    mocks.getWorkspaceMessagingOnboardingState(...args),
  applyOnboardingStepsWithWorkspaceNumbers: (state: unknown) => state,
  applyWorkspaceOnboardingChannelPolicy: (state: unknown) => state,
  deriveWorkspaceMessagingReadiness: () => ({
    ready: false,
    blockingIssues: [],
  }),
  isWizardOnboardingStepId: () => true,
}));

vi.mock("@/lib/onboarding/onboarding-persist.server", () => ({
  persistWorkspaceOnboardingState: (...args: unknown[]) =>
    mocks.persistWorkspaceOnboardingState(...args),
}));

vi.mock("@/lib/onboarding/emergency-voice.server", () => ({
  reviewWorkspaceEmergencyVoice: vi.fn(),
}));

vi.mock("@/lib/worker/handlers.server", () => ({
  enqueueWorkspaceComplianceJob: (...args: unknown[]) =>
    mocks.enqueueWorkspaceComplianceJob(...args),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceCredits: (...args: unknown[]) => mocks.getWorkspaceCredits(...args),
}));

vi.mock("@/lib/rcs-onboarding.server", () => ({
  TWILIO_RCS_PROVIDER: "twilio",
  getWorkspaceRcsBlockingIssues: () => [],
  hydrateWorkspaceRcsOnboardingState: (state: unknown) => state,
  isRcsOnboardingEnabled: () => false,
  stripDisabledRcsChannel: (channels: unknown) => channels,
  updateWorkspaceRcsOnboarding: vi.fn(),
}));

vi.mock("@/lib/twilio-bootstrap.server", () => ({
  ensureWorkspaceTwilioBootstrap: vi.fn(),
}));

vi.mock("@/lib/twilio-a2p.server", () => ({
  buildA2pBlockingIssues: () => [],
  provisionWorkspaceA2P: vi.fn(),
}));

vi.mock("@/lib/twilio-sender-pool.server", () => ({
  attachWorkspaceRcsSenderToPool: vi.fn(),
}));

vi.mock("@/lib/caller-id-verification.server", () => ({
  startWorkspaceCallerIdVerification: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    audience: { count: vi.fn().mockResolvedValue(0) },
    campaign: { count: vi.fn().mockResolvedValue(0) },
    script: { count: vi.fn().mockResolvedValue(0) },
  }),
}));

vi.mock("@/lib/database/workspace-twilio-portal-snapshot.server", () => ({
  getWorkspaceRecentOutboundMessageCount: vi.fn().mockResolvedValue(0),
}));

import {
  mapOnboardingHandlerResult,
  runOnboardingAction,
} from "../app/lib/platform-onboarding.server";
import {
  BUSINESS_IDENTITY_REQUIRED_FIELDS,
  BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS,
} from "../app/lib/messaging-onboarding/predicates";
import { resolvePersistedWizardStep } from "../app/lib/messaging-onboarding/wizard-steps";

const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";

const EMPTY_BUSINESS_PROFILE = {
  legalBusinessName: "",
  businessType: "",
  websiteUrl: "",
  privacyPolicyUrl: "",
  termsOfServiceUrl: "",
  supportEmail: "",
  supportPhone: "",
  useCaseSummary: "",
  optInWorkflow: "",
  tollFreeOptInType: null,
  optInKeywords: "",
  optOutKeywords: "",
  helpKeywords: "",
  sampleMessages: [] as string[],
  doingBusinessAs: "",
  businessRegistrationNumber: "",
  ageGatedContent: false,
  ein: "",
  industry: "",
  authorizedRepName: "",
  authorizedRepEmail: "",
  authorizedRepPhone: "",
  authorizedRepTitle: "",
};

function onboardingState(overrides: Record<string, unknown> = {}) {
  return {
    status: "not_started",
    currentStep: "business_identity",
    operatingCountry: "CA",
    selectedChannels: [] as string[],
    selectedGoal: null,
    businessProfile: { ...EMPTY_BUSINESS_PROFILE },
    emergencyVoice: {
      enabled: false,
      status: "not_started",
      emergencyEligiblePhoneNumbers: [] as string[],
      ineligibleCallerIds: [] as string[],
      lastReviewedAt: null,
      address: {
        customerName: "",
        street: "",
        city: "",
        region: "",
        postalCode: "",
        countryCode: "CA",
        addressSid: null,
        status: "not_started",
        validationError: null,
        lastValidatedAt: null,
      },
    },
    messagingService: {
      serviceSid: null,
      desiredSendMode: "messaging_service",
    },
    a2p10dlc: { status: "not_started" },
    rcs: { status: "not_started", regions: [] as string[] },
    reviewState: { blockingIssues: [] as string[], lastError: null },
    steps: [],
    ...overrides,
  };
}

function identityForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("_action", "save_business_profile");
  formData.set("wizardStep", "business_identity");
  formData.set("legalBusinessName", "");
  formData.set("businessType", "");
  formData.set("websiteUrl", "");
  formData.set("privacyPolicyUrl", "");
  formData.set("termsOfServiceUrl", "");
  formData.set("supportEmail", "");
  formData.set("supportPhone", "");
  formData.set("operatingCountry", "CA");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

function programForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("_action", "save_business_profile");
  formData.set("wizardStep", "business_program");
  formData.set("useCaseSummary", "");
  formData.set("optInWorkflow", "");
  formData.set("optInKeywords", "");
  formData.set("optOutKeywords", "");
  formData.set("helpKeywords", "");
  formData.set("sampleMessages", "");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

function completeBaselineForm(): FormData {
  const formData = new FormData();
  formData.set("_action", "save_business_profile");
  formData.set("legalBusinessName", "Northgate Services Inc.");
  formData.set("websiteUrl", "https://www.northgateservices.example");
  formData.set("useCaseSummary", "Appointment reminders for booked clients.");
  formData.set(
    "sampleMessages",
    "Northgate: your appointment is tomorrow at 9:30 AM.",
  );
  formData.set("operatingCountry", "CA");
  return formData;
}

describe("save_business_profile validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState(),
    );
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.getWorkspaceCredits.mockResolvedValue(0);
  });

  test.each(["save_business_profile", "save_channels"])(
    "%s refuses an invalid selection before writing",
    async (action) => {
      mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
        onboardingState({
          selectedGoal: "sms_blast",
          selectedChannels: ["toll_free_bulk_sms"],
          businessProfile: {
            ...EMPTY_BUSINESS_PROFILE,
            legalBusinessName: "Acme",
            tollFreeOptInType: "WEB_FORM",
          },
        }),
      );
      const outcome = await runOnboardingAction(USER_ID, WORKSPACE_ID, action, {
        legalBusinessName: "Acme",
        tollFreeOptInType: "NOT_VERBAL",
        selectedGoal: "sms_blast",
      });
      expect(outcome).toMatchObject({ ok: false, status: 400 });
      expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
      expect(mocks.enqueueWorkspaceComplianceJob).not.toHaveBeenCalled();
    },
  );

  test("the toll-free identity step cannot advance without an explicit consent selection", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
      }),
    );
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({ legalBusinessName: "Acme" }),
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        kind: "payload",
        status: 400,
        data: {
          error:
            "Choose how customers consent to toll-free SMS in Business identity.",
        },
      },
    });
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("an exact consent selection is saved with the identity form", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
      }),
    );
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Acme",
        tollFreeOptInType: "MOBILE_QR_CODE",
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          businessProfile: expect.objectContaining({
            tollFreeOptInType: "MOBILE_QR_CODE",
          }),
        }),
      }),
    );
  });

  test("saving a different wizard step preserves the previous consent selection", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
        businessProfile: {
          ...EMPTY_BUSINESS_PROFILE,
          legalBusinessName: "Acme",
          tollFreeOptInType: "PAPER_FORM",
        },
      }),
    );
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      programForm({
        useCaseSummary: "Appointment reminders",
        sampleMessages:
          "Acme: Your appointment is tomorrow. Reply STOP to stop.",
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          businessProfile: expect.objectContaining({
            tollFreeOptInType: "PAPER_FORM",
          }),
        }),
      }),
    );
  });

  // The intake gate must equal what the Identity screen collects. When it
  // demanded the two Program fields as well, every non-SMS goal was trapped in
  // onboarding forever (the Program step is only shown for sms_blast).
  test("baseline required fields are exactly the Identity screen's fields", () => {
    expect([...BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS]).toEqual([
      "legalBusinessName",
    ]);
    expect([...BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS]).toEqual([
      ...BUSINESS_IDENTITY_REQUIRED_FIELDS,
    ]);
  });

  test("maps legacy business_profile persisted step to business_identity", () => {
    expect(resolvePersistedWizardStep("business_profile")).toBe(
      "business_identity",
    );
    expect(resolvePersistedWizardStep(null)).toBe("path_selection");
  });

  test("rejects an empty identity submit instead of advancing", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toContain(
      "Legal business name is required.",
    );
    // websiteUrl is optional at intake — plenty of customers have no website.
    // Messaging channels still demand it via the per-channel predicates.
    expect(outcome.result.data.error).not.toContain("Website URL is required.");
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("advances identity save to business_program for SMS goals", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({ selectedGoal: "sms_blast" }),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Northgate Services Inc.",
        websiteUrl: "https://www.northgateservices.example",
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect",
      step: "business_program",
    });
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ currentStep: "business_program" }),
      }),
    );
  });

  test("identity save persists the SMS business fields shown for selected channels", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms", "a2p10dlc"],
      }),
    );

    await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Northgate Services Inc.",
        websiteUrl: "https://www.northgateservices.example",
        doingBusinessAs: "Northgate",
        tollFreeOptInType: "WEB_FORM",
        businessRegistrationNumber: "123456789RC0001",
        ageGatedContent: "true",
        channelSampleMessages:
          "Northgate: your appointment is tomorrow.\nReply STOP to opt out.",
        a2pCompanyType: "private",
        ein: "12-3456789",
        industry: "Healthcare",
        authorizedRepName: "Jordan Smith",
        authorizedRepTitle: "Head of Operations",
        authorizedRepEmail: "jordan@northgate.example",
        authorizedRepPhone: "+1 555 123 4567",
      }),
    );

    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          businessProfile: expect.objectContaining({
            doingBusinessAs: "Northgate",
            tollFreeOptInType: "WEB_FORM",
            businessRegistrationNumber: "123456789RC0001",
            ageGatedContent: true,
            sampleMessages: [
              "Northgate: your appointment is tomorrow.",
              "Reply STOP to opt out.",
            ],
            ein: "12-3456789",
            industry: "Healthcare",
            authorizedRepName: "Jordan Smith",
            authorizedRepTitle: "Head of Operations",
            authorizedRepEmail: "jordan@northgate.example",
            authorizedRepPhone: "+1 555 123 4567",
          }),
        }),
      }),
    );
  });

  test("advances identity save to audience when program is not required", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({ selectedGoal: "live_call" }),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Northgate Services Inc.",
        websiteUrl: "https://www.northgateservices.example",
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect",
      step: "audience",
    });
  });

  test("identity save preserves previously saved program fields", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        businessProfile: {
          ...EMPTY_BUSINESS_PROFILE,
          useCaseSummary: "Existing use case.",
          sampleMessages: ["Existing sample."],
        },
      }),
    );

    await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Northgate Services Inc.",
        websiteUrl: "https://www.northgateservices.example",
      }),
    );

    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          businessProfile: expect.objectContaining({
            legalBusinessName: "Northgate Services Inc.",
            websiteUrl: "https://www.northgateservices.example",
            useCaseSummary: "Existing use case.",
            sampleMessages: ["Existing sample."],
          }),
        }),
      }),
    );
  });

  test("rejects an empty program submit", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      programForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toContain(
      "Use case summary is required.",
    );
    expect(outcome.result.data.error).toContain(
      "At least one sample message is required.",
    );
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("advances program save to audience for SMS goals", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({ selectedGoal: "sms_blast" }),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      programForm({
        useCaseSummary: "Appointment reminders for booked clients.",
        sampleMessages: "Northgate: your appointment is tomorrow at 9:30 AM.",
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect",
      step: "audience",
    });
    const mapped = mapOnboardingHandlerResult(
      outcome.result,
      outcome.detail,
      "ui",
    );
    expect(mapped).toMatchObject({ kind: "ui_redirect", step: "audience" });
  });

  test("advances the program save even when intake was already complete (#1471)", async () => {
    // The Identity save completes intake before the Program step is reached.
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        status: "collecting_business",
        currentStep: "business_program",
        selectedGoal: "sms_blast",
        businessProfile: {
          ...EMPTY_BUSINESS_PROFILE,
          legalBusinessName: "Northgate Clinic",
        },
      }),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      programForm({
        useCaseSummary: "Appointment reminders for booked clients.",
        sampleMessages: "Northgate: your appointment is tomorrow at 9:30 AM.",
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect",
      step: "audience",
    });
  });

  test("a hint-less save after intake still returns to the capability surface", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        status: "collecting_business",
        selectedGoal: "sms_blast",
        businessProfile: {
          ...EMPTY_BUSINESS_PROFILE,
          legalBusinessName: "Northgate Clinic",
        },
      }),
    );
    const form = programForm({
      useCaseSummary: "Appointment reminders for booked clients.",
      sampleMessages: "Northgate: your appointment is tomorrow at 9:30 AM.",
    });
    form.delete("wizardStep");
    form.set("legalBusinessName", "Northgate Clinic");
    form.set("returnTo", `/workspaces/${WORKSPACE_ID}/settings`);

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      form,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect_path",
      path: `/workspaces/${WORKSPACE_ID}/settings`,
    });
  });

  test("full baseline submit without wizardStep advances to audience", async () => {
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({ selectedGoal: "live_call" }),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      completeBaselineForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({
      kind: "redirect",
      step: "audience",
    });
  });
  test("rejects a JSON API submit with blank required fields", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      {
        legalBusinessName: "",
        websiteUrl: "",
        useCaseSummary: "",
        sampleMessages: [],
      },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.status).toBe(400);
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });
});

describe("A2P identity save requirements (#2282)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.requireWorkspaceAccess.mockResolvedValue({ role: "owner" });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(
      onboardingState({
        selectedGoal: "sms_blast",
        selectedChannels: ["a2p10dlc"],
      }),
    );
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceCredits.mockResolvedValue(0);
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(onboardingState());
  });
  test.each([""])(
    "company type %s cannot advance identity or write",
    async (company) => {
      const outcome = await runOnboardingAction(
        USER_ID,
        WORKSPACE_ID,
        "save_business_profile",
        identityForm({
          legalBusinessName: "Acme",
          websiteUrl: "https://acme.example",
          a2pCompanyType: company,
        }),
      );
      expect(outcome).toMatchObject({
        ok: true,
        result: { kind: "payload", status: 400 },
      });
      expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
    },
  );
  test.each(["a2pStockExchange", "a2pStockTicker", "a2pBrandContactEmail"])(
    "missing public %s prevents advancement",
    async (field) => {
      const form = identityForm({
        legalBusinessName: "Acme",
        websiteUrl: "https://acme.example",
        a2pCompanyType: "public",
        a2pStockExchange: "NASDAQ",
        a2pStockTicker: "ACME",
        a2pBrandContactEmail: "jordan@acme.example",
      });
      form.delete(field);
      const outcome = await runOnboardingAction(
        USER_ID,
        WORKSPACE_ID,
        "save_business_profile",
        form,
      );
      expect(outcome).toMatchObject({
        ok: true,
        result: { kind: "payload", status: 400 },
      });
      expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
    },
  );
  test("complete public fields advance and persist exact provider codes", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      identityForm({
        legalBusinessName: "Acme",
        websiteUrl: "https://acme.example",
        a2pCompanyType: "public",
        a2pStockExchange: "TSX",
        a2pStockTicker: "ACME",
        a2pBrandContactEmail: "jordan@acme.example",
      }),
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: { kind: "redirect", step: "business_program" },
    });
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          businessProfile: expect.objectContaining({
            a2pCompanyType: "public",
            a2pStockExchange: "TSX",
            a2pStockTicker: "ACME",
            a2pBrandContactEmail: "jordan@acme.example",
          }),
        }),
      }),
    );
  });
  test("invalid JSON email is rejected before persistence", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      { a2pCompanyType: "public", a2pBrandContactEmail: "bad-email" },
    );
    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });
  test.each(["save_business_profile", "save_channels"])(
    "%s rejects an invalid company enum before any write",
    async (action) => {
      const outcome = await runOnboardingAction(USER_ID, WORKSPACE_ID, action, {
        a2pCompanyType: "Public",
      });
      expect(outcome).toMatchObject({
        ok: false,
        status: 400,
        error: "Choose a valid A2P company type.",
      });
      expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
      expect(mocks.enqueueWorkspaceComplianceJob).not.toHaveBeenCalled();
    },
  );
});
