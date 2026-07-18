import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The first onboarding page collects the workspace name. Submitting a blank
 * name must stay on that page; a valid name updates the workspace and advances
 * to business_profile.
 */

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspacePhoneNumbers: vi.fn(),
  getWorkspaceMessagingOnboardingState: vi.fn(),
  persistWorkspaceOnboardingState: vi.fn(),
  getWorkspaceCredits: vi.fn(),
  updateWorkspaceName: vi.fn(),
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
  isWizardOnboardingStepId: (value: string) =>
    [
      "business_profile",
      "path_selection",
      "audience",
      "first_number",
      "script",
      "campaign_info",
      "credits",
      "launch_checks",
    ].includes(value),
}));

vi.mock("@/lib/onboarding/onboarding-persist.server", () => ({
  persistWorkspaceOnboardingState: (...args: unknown[]) =>
    mocks.persistWorkspaceOnboardingState(...args),
}));

vi.mock("@/lib/onboarding/emergency-voice.server", () => ({
  reviewWorkspaceEmergencyVoice: vi.fn(),
}));

vi.mock("@/lib/worker/handlers.server", () => ({
  enqueueWorkspaceComplianceJob: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceCredits: (...args: unknown[]) => mocks.getWorkspaceCredits(...args),
}));

vi.mock("@/lib/platform-workspace.server", () => ({
  updateWorkspaceName: (...args: unknown[]) => mocks.updateWorkspaceName(...args),
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

const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";

function onboardingState() {
  return {
    status: "not_started",
    currentStep: "business_profile",
    operatingCountry: "CA",
    selectedChannels: [] as string[],
    selectedGoal: null,
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
    },
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

function nameForm(name: string): FormData {
  const formData = new FormData();
  formData.set("_action", "save_workspace_name");
  formData.set("workspaceName", name);
  return formData;
}

describe("save_workspace_name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(onboardingState());
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.getWorkspaceCredits.mockResolvedValue(0);
    mocks.updateWorkspaceName.mockResolvedValue({
      ok: true,
      workspace: { id: WORKSPACE_ID, name: "Acme Outreach" },
    });
  });

  test("rejects a blank workspace name instead of advancing", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_workspace_name",
      nameForm("   "),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toMatch(/workspace name/i);
    expect(mocks.updateWorkspaceName).not.toHaveBeenCalled();
    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("saves the name and redirects to business basics", async () => {
    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_workspace_name",
      nameForm("Acme Outreach"),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(mocks.updateWorkspaceName).toHaveBeenCalledWith(
      USER_ID,
      WORKSPACE_ID,
      "Acme Outreach",
    );
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        updates: expect.objectContaining({
          status: "collecting_business",
          currentStep: "business_profile",
        }),
      }),
    );

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped).toEqual({
      kind: "ui_redirect",
      step: "business_profile",
      searchParams: undefined,
    });
  });
});
