import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Validate-address from Numbers settings posts to the onboarding action.
 * Without a returnTo redirect, React Router leaves the user on the wizard.
 */

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspacePhoneNumbers: vi.fn(),
  getWorkspaceMessagingOnboardingState: vi.fn(),
  persistWorkspaceOnboardingState: vi.fn(),
  getWorkspaceCredits: vi.fn(),
  reviewWorkspaceEmergencyVoice: vi.fn(),
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
      "business_identity",
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
  reviewWorkspaceEmergencyVoice: (...args: unknown[]) =>
    mocks.reviewWorkspaceEmergencyVoice(...args),
}));

vi.mock("@/lib/worker/handlers.server", () => ({
  enqueueWorkspaceComplianceJob: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceCredits: (...args: unknown[]) => mocks.getWorkspaceCredits(...args),
}));

vi.mock("@/lib/platform-workspace.server", () => ({
  updateWorkspaceName: vi.fn(),
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

const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";

function onboardingState() {
  return {
    status: "collecting_business",
    currentStep: "first_number",
    operatingCountry: "CA",
    selectedChannels: [] as string[],
    selectedGoal: null,
    businessProfile: {
      legalBusinessName: "Acme",
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
      status: "collecting_business",
      emergencyEligiblePhoneNumbers: [] as string[],
      ineligibleCallerIds: [] as string[],
      lastReviewedAt: null,
      address: {
        customerName: "Acme",
        street: "123 Main St",
        city: "Toronto",
        region: "ON",
        postalCode: "M5V 2T6",
        countryCode: "CA",
        addressSid: null,
        status: "pending_validation",
        validationError: null,
        lastValidatedAt: null,
      },
    },
    messagingService: { serviceSid: "MG123", desiredSendMode: "messaging_service" },
    a2p10dlc: { status: "not_started" },
    rcs: { status: "not_started", regions: [] as string[] },
    reviewState: { blockingIssues: [] as string[], lastError: null },
    steps: [],
  };
}

describe("review_emergency_voice returnTo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(onboardingState());
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.getWorkspaceCredits.mockResolvedValue(0);
    mocks.reviewWorkspaceEmergencyVoice.mockResolvedValue({
      ok: true,
      success:
        "Emergency address validated. Add or refresh a rented voice number to finish voice readiness.",
    });
  });

  test("redirects back to Numbers settings when returnTo is present", async () => {
    const formData = new FormData();
    formData.set("_action", "review_emergency_voice");
    formData.set("returnTo", `/workspaces/${WORKSPACE_ID}/settings/numbers`);

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "review_emergency_voice",
      formData,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped).toEqual({
      kind: "ui_redirect_path",
      path: `/workspaces/${WORKSPACE_ID}/settings/numbers`,
      searchParams: { saved: "emergency_voice" },
    });
  });

  test("returns a success payload when returnTo is absent", async () => {
    const formData = new FormData();
    formData.set("_action", "review_emergency_voice");

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "review_emergency_voice",
      formData,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;
    expect(outcome.result.data.success).toMatch(/validated/i);
  });

  test("redirects validation errors back to returnTo instead of the wizard", async () => {
    mocks.reviewWorkspaceEmergencyVoice.mockResolvedValue({
      ok: false,
      error: "Save a complete emergency service address before running voice review.",
      status: 400,
    });

    const formData = new FormData();
    formData.set("_action", "review_emergency_voice");
    formData.set("returnTo", `/workspaces/${WORKSPACE_ID}/settings/numbers`);

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "review_emergency_voice",
      formData,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped).toEqual({
      kind: "ui_redirect_path",
      path: `/workspaces/${WORKSPACE_ID}/settings/numbers`,
      searchParams: {
        warning:
          "Save a complete emergency service address before running voice review.",
      },
    });
  });
});
