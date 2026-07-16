import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * JOURNEY-NITPICK-04: the Business basics step (wizard step 1) must not advance
 * to `path_selection` when the baseline required business-profile fields are
 * blank. The wizard advances purely because `save_business_profile` returns a
 * redirect result, so "does not advance" is asserted as "does not return a
 * redirect" — plus proof that nothing was persisted.
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

import {
  mapOnboardingHandlerResult,
  runOnboardingAction,
} from "../app/lib/platform-onboarding.server";
import { BUSINESS_PROFILE_BASELINE_REQUIRED_FIELDS } from "../app/lib/messaging-onboarding/predicates";

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

function onboardingState() {
  return {
    status: "not_started",
    currentStep: "business_profile",
    operatingCountry: "CA",
    selectedChannels: [] as string[],
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
  };
}

/** An empty step-1 submit: every field present but blank, as the browser posts it. */
function emptyBusinessBasicsForm(): FormData {
  const formData = new FormData();
  formData.set("_action", "save_business_profile");
  for (const field of [
    "legalBusinessName",
    "businessType",
    "websiteUrl",
    "privacyPolicyUrl",
    "termsOfServiceUrl",
    "supportEmail",
    "supportPhone",
    "useCaseSummary",
    "optInWorkflow",
    "optInKeywords",
    "optOutKeywords",
    "helpKeywords",
    "sampleMessages",
    "addressStreet",
    "addressCity",
    "addressRegion",
    "addressPostalCode",
  ]) {
    formData.set(field, "");
  }
  formData.set("operatingCountry", "CA");
  return formData;
}

function completeBusinessBasicsForm(): FormData {
  const formData = emptyBusinessBasicsForm();
  formData.set("legalBusinessName", "Northgate Services Inc.");
  formData.set("websiteUrl", "https://www.northgateservices.example");
  formData.set("useCaseSummary", "Appointment reminders for booked clients.");
  formData.set("sampleMessages", "Northgate: your appointment is tomorrow at 9:30 AM.");
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

  test("rejects an empty step-1 submit instead of advancing", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      emptyBusinessBasicsForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;

    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toContain("Legal business name is required.");
    expect(outcome.result.data.error).toContain("Website URL is required.");
    expect(outcome.result.data.error).toContain("Use case summary is required.");
    expect(outcome.result.data.error).toContain("At least one sample message is required.");
  });

  test("does not persist onboarding state for an empty step-1 submit", async () => {
    await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      emptyBusinessBasicsForm(),
    );

    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
    expect(mocks.enqueueWorkspaceComplianceJob).not.toHaveBeenCalled();
  });

  test("does not redirect the wizard to path_selection on an empty submit", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      emptyBusinessBasicsForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped.kind).toBe("ui_payload");
    expect(mapped.kind === "ui_payload" && mapped.status).toBe(400);
  });

  test("rejects a partial submit that is missing only sample messages", async () => {
    const formData = completeBusinessBasicsForm();
    formData.set("sampleMessages", "   ");

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      formData,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;

    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toBe("At least one sample message is required.");
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
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

  test("still advances to path_selection when the required fields are filled in", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_business_profile",
      completeBusinessBasicsForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result).toMatchObject({ kind: "redirect", step: "path_selection" });
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledTimes(1);

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped).toMatchObject({ kind: "ui_redirect", step: "path_selection" });
  });
});
