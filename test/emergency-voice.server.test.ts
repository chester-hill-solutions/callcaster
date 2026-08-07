import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorkspaceTwilioInstance: vi.fn(),
  getWorkspacePhoneNumbers: vi.fn(),
  updateWorkspacePhoneNumber: vi.fn(),
  getWorkspaceMessagingOnboardingState: vi.fn(),
  persistWorkspaceOnboardingState: vi.fn(),
  hasVoiceCapability: vi.fn(() => true),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...a: unknown[]) => mocks.createWorkspaceTwilioInstance(...a),
  getWorkspacePhoneNumbers: (...a: unknown[]) => mocks.getWorkspacePhoneNumbers(...a),
  updateWorkspacePhoneNumber: (...a: unknown[]) => mocks.updateWorkspacePhoneNumber(...a),
}));
vi.mock("@/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...a: unknown[]) =>
    mocks.getWorkspaceMessagingOnboardingState(...a),
}));
vi.mock("@/lib/onboarding/onboarding-persist.server", () => ({
  persistWorkspaceOnboardingState: (...a: unknown[]) => mocks.persistWorkspaceOnboardingState(...a),
}));
vi.mock("@/lib/onboarding/voice-capabilities", () => ({
  hasVoiceCapability: (...a: unknown[]) => mocks.hasVoiceCapability(...a),
}));

function onboardingState() {
  return {
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
    businessProfile: { legalBusinessName: "Acme" },
  };
}

function twilioMock() {
  return {
    addresses: { create: vi.fn(async () => ({ sid: "AD1" })) },
    incomingPhoneNumbers: Object.assign(
      (_sid: string) => ({ update: vi.fn(async () => ({})) }),
      { list: vi.fn(async () => [{ sid: "PN1" }]) },
    ),
  };
}

describe("reviewWorkspaceEmergencyVoice error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasVoiceCapability.mockReturnValue(true);
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue(onboardingState());
    mocks.createWorkspaceTwilioInstance.mockResolvedValue(twilioMock());
    mocks.persistWorkspaceOnboardingState.mockResolvedValue(undefined);
    mocks.updateWorkspacePhoneNumber.mockResolvedValue(undefined);
  });

  test("persists partial success (not rejected) when a number update fails after the address was created", async () => {
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({
      data: [
        { id: 1, phone_number: "+15550000001", type: "rented", capabilities: {} },
        { id: 2, phone_number: "+15550000002", type: "rented", capabilities: {} },
      ],
    });
    // Number 1 goes fully live; the DB write for number 2 throws.
    mocks.updateWorkspacePhoneNumber.mockImplementation(async ({ numberId }: { numberId: number }) => {
      if (numberId === 2) throw new Error("db write failed");
    });

    const { reviewWorkspaceEmergencyVoice } = await import(
      "@/lib/onboarding/emergency-voice.server"
    );
    const result = await reviewWorkspaceEmergencyVoice({ workspaceId: "w1", actorUserId: "u1" });

    expect(result.ok).toBe(false);
    expect(mocks.persistWorkspaceOnboardingState).toHaveBeenCalledTimes(1);
    const updates = mocks.persistWorkspaceOnboardingState.mock.calls[0][0].updates;
    // Must NOT blanket-reject: the genuinely-live number must survive.
    expect(updates.emergencyVoice.status).not.toBe("rejected");
    expect(updates.emergencyVoice.emergencyEligiblePhoneNumbers).toContain("+15550000001");
    expect(updates.emergencyVoice.address.status).toBe("validated");
  });

  test("rejects when the address creation itself fails (nothing applied)", async () => {
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({
      data: [{ id: 1, phone_number: "+15550000001", type: "rented", capabilities: {} }],
    });
    const twilio = twilioMock();
    twilio.addresses.create.mockRejectedValueOnce(new Error("address invalid"));
    mocks.createWorkspaceTwilioInstance.mockResolvedValue(twilio);

    const { reviewWorkspaceEmergencyVoice } = await import(
      "@/lib/onboarding/emergency-voice.server"
    );
    const result = await reviewWorkspaceEmergencyVoice({ workspaceId: "w1", actorUserId: "u1" });

    expect(result.ok).toBe(false);
    const updates = mocks.persistWorkspaceOnboardingState.mock.calls[0][0].updates;
    expect(updates.emergencyVoice.status).toBe("rejected");
    expect(updates.emergencyVoice.emergencyEligiblePhoneNumbers).toEqual([]);
    expect(updates.emergencyVoice.address.status).toBe("invalid");
    // No phone-number writes happened because the address failed first.
    expect(mocks.updateWorkspacePhoneNumber).not.toHaveBeenCalled();
  });
});
