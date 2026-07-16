import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Audit-C P1: the Channels step called `ensureWorkspaceTwilioBootstrap`
 * unconditionally when no Messaging Service SID exists yet, and let it throw
 * raw on failure (e.g. "Workspace is missing Twilio account credentials").
 * `runOnboardingAction`'s outer catch turns any thrown error into a 500,
 * which trips the onboarding route's ErrorBoundary and strands the wizard on
 * a blank page instead of showing an inline message and staying on the step.
 *
 * `handleSaveChannels` must instead catch that failure itself and return the
 * same `{ kind: "payload", data: { error }, status }` shape its sibling
 * handlers (e.g. `save_rcs`, `attach_rcs_sender`) already use.
 */

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspacePhoneNumbers: vi.fn(),
  getWorkspaceMessagingOnboardingState: vi.fn(),
  persistWorkspaceOnboardingState: vi.fn(),
  enqueueWorkspaceComplianceJob: vi.fn(),
  getWorkspaceCredits: vi.fn(),
  ensureWorkspaceTwilioBootstrap: vi.fn(),
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
  ensureWorkspaceTwilioBootstrap: (...args: unknown[]) =>
    mocks.ensureWorkspaceTwilioBootstrap(...args),
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
    status: "collecting_business",
    currentStep: "channels",
    operatingCountry: "CA",
    selectedChannels: [] as string[],
    businessProfile: {},
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
    // No Messaging Service SID yet — this is what makes handleSaveChannels
    // call ensureWorkspaceTwilioBootstrap.
    messagingService: { serviceSid: null, desiredSendMode: "messaging_service" },
    a2p10dlc: { status: "not_started" },
    rcs: { status: "not_started", regions: [] as string[] },
    reviewState: { blockingIssues: [] as string[], lastError: null },
    steps: [],
  };
}

function saveChannelsForm() {
  const formData = new FormData();
  formData.set("_action", "save_channels");
  formData.append("selectedChannels", "sms");
  return formData;
}

describe("save_channels bootstrap failure surfaces a friendly payload, not a throw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [] });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(onboardingState());
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.getWorkspaceCredits.mockResolvedValue(0);
  });

  test("runOnboardingAction resolves ok:true with a payload error (not ok:false/500) when bootstrap throws", async () => {
    mocks.ensureWorkspaceTwilioBootstrap.mockRejectedValue(
      new Error("Workspace is missing Twilio account credentials"),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_channels",
      saveChannelsForm(),
    );

    // Falsification target: before the fix, the throw propagates out of
    // handleSaveChannels, runOnboardingAction's catch converts it to
    // { ok: false, status: 500 }, and the UI action wraps that as a thrown
    // Response that hits the route ErrorBoundary.
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.kind).toBe("payload");
    if (outcome.result.kind !== "payload") return;

    expect(outcome.result.status).toBe(400);
    expect(outcome.result.data.error).toContain("Twilio");
  });

  test("does not persist onboarding state or advance the wizard step on bootstrap failure", async () => {
    mocks.ensureWorkspaceTwilioBootstrap.mockRejectedValue(
      new Error("Workspace is missing Twilio account credentials"),
    );

    await runOnboardingAction(USER_ID, WORKSPACE_ID, "save_channels", saveChannelsForm());

    expect(mocks.persistWorkspaceOnboardingState).not.toHaveBeenCalled();
  });

  test("maps to a ui_payload (stays on step), not a thrown 500", async () => {
    mocks.ensureWorkspaceTwilioBootstrap.mockRejectedValue(
      new Error("Workspace is missing Twilio account credentials"),
    );

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_channels",
      saveChannelsForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
    expect(mapped.kind).toBe("ui_payload");
    expect(mapped.kind === "ui_payload" && mapped.status).toBe(400);
  });

  test("still redirects to first_number on the happy path (bootstrap succeeds)", async () => {
    mocks.ensureWorkspaceTwilioBootstrap.mockResolvedValue(undefined);

    const outcome = await runOnboardingAction(
      USER_ID,
      WORKSPACE_ID,
      "save_channels",
      saveChannelsForm(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({ kind: "redirect", step: "first_number" });
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledTimes(1);
  });
});
