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
  deriveWorkspaceMessagingReadiness: () => ({ ready: false, blockingIssues: [] }),
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
import { BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS } from "../app/lib/messaging-onboarding/predicates";
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
    messagingService: { serviceSid: null, desiredSendMode: "messaging_service" },
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
  formData.set("sampleMessages", "Northgate: your appointment is tomorrow at 9:30 AM.");
  formData.set("operatingCountry", "CA");
  return formData;
}

describe("save_business_profile validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(onboardingState());
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.getWorkspaceCredits.mockResolvedValue(0);
  });

  test("baseline required fields are the intersection of the per-channel lists", () => {
    expect([...BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS]).toEqual([
      "legalBusinessName",
      "websiteUrl",
      "useCaseSummary",
      "sampleMessages",
    ]);
  });

  test("maps legacy business_profile persisted step to business_identity", () => {
    expect(resolvePersistedWizardStep("business_profile")).toBe("business_identity");
    expect(resolvePersistedWizardStep(null)).toBe("business_identity");
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
    expect(outcome.result.data.error).toContain("Legal business name is required.");
    expect(outcome.result.data.error).toContain("Website URL is required.");
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("advances identity save to business_program", async () => {
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
    expect(outcome.result).toMatchObject({ kind: "redirect", step: "business_program" });
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ currentStep: "business_program" }),
      }),
    );
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
    expect(outcome.result.data.error).toContain("Use case summary is required.");
    expect(outcome.result.data.error).toContain("At least one sample message is required.");
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("advances program save to path_selection", async () => {
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
    expect(outcome.result).toMatchObject({ kind: "redirect", step: "path_selection" });
    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped).toMatchObject({ kind: "ui_redirect", step: "path_selection" });
  });

  test("full baseline submit without wizardStep still advances to path_selection", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      completeBaselineForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({ kind: "redirect", step: "path_selection" });
  });

  test("rejects a JSON API submit with blank required fields", async () => {
    const outcome = await runOnboardingAction(USER_ID, WORKSPACE_ID, "save_business_profile", {
      legalBusinessName: "",
      websiteUrl: "",
      useCaseSummary: "",
      sampleMessages: [],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.status).toBe(400);
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });
});
