import { describe, expect, test, vi } from "vitest";

import {
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  mergeWorkspaceMessagingOnboardingState,
} from "../app/lib/messaging-onboarding.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
  updateWorkspaceRcsOnboarding,
} from "../app/lib/rcs-onboarding.server";

function makeSupabase(
  twilioData: unknown,
  options?: { selectError?: unknown; updateError?: unknown },
) {
  const updateEq = vi.fn(async () => ({ error: options?.updateError ?? null }));
  return {
    from: vi.fn((table: string) => {
      if (table !== "workspace") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn(async () => ({
              data: { twilio_data: twilioData },
              error: options?.selectError ?? null,
            })),
          }),
        }),
        update: () => ({ eq: updateEq }),
      };
    }),
    _updateEq: updateEq,
  };
}

describe("RCS onboarding helpers", () => {
  test("hydrates the RCS draft from saved business details", () => {
    const hydrated = hydrateWorkspaceRcsOnboardingState(
      mergeWorkspaceMessagingOnboardingState(
        DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
        {
          selectedChannels: ["rcs"],
          businessProfile: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile,
            legalBusinessName: "Acme Health",
            supportEmail: "support@acme.test",
            useCaseSummary:
              "We send appointment reminders and follow-up updates.",
          },
          emergencyVoice: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice,
            address: {
              ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.emergencyVoice
                .address,
              countryCode: "CA",
            },
          },
        },
      ),
    );

    expect(hydrated.rcs.displayName).toBe("Acme Health");
    expect(hydrated.rcs.publicDescription).toBe(
      "We send appointment reminders and follow-up updates.",
    );
    expect(hydrated.rcs.notificationEmail).toBe("support@acme.test");
    expect(hydrated.rcs.representativeEmail).toBe("support@acme.test");
    expect(hydrated.rcs.regions).toEqual(["Canada"]);
    expect(hydrated.messagingService.supportedChannels).toContain("rcs");
    expect(hydrated.rcs.status).toBe("provisioning");
  });

  test("reports only the remaining manual RCS submission gaps", () => {
    const hydrated = hydrateWorkspaceRcsOnboardingState(
      mergeWorkspaceMessagingOnboardingState(
        DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
        {
          selectedChannels: ["rcs"],
          businessProfile: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.businessProfile,
            legalBusinessName: "Acme Health",
            websiteUrl: "https://acme.test",
            privacyPolicyUrl: "https://acme.test/privacy",
            termsOfServiceUrl: "https://acme.test/terms",
            supportEmail: "support@acme.test",
            useCaseSummary:
              "We send appointment reminders and follow-up updates.",
            optInWorkflow: "Customers opt in during scheduling.",
            sampleMessages: ["Acme Health: Your visit is tomorrow at 9:30 AM."],
          },
          messagingService: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
            serviceSid: "MG123",
          },
        },
      ),
    );

    const issues = getWorkspaceRcsBlockingIssues(hydrated);

    expect(issues).not.toContain("Add the RCS sender display name.");
    expect(issues).not.toContain("Add the public RCS sender description.");
    expect(issues).not.toContain("Add the RCS notification email.");
    expect(issues).toContain("Add the authorized representative name.");
    expect(issues).toContain(
      "Upload a square logo image URL for the sender package.",
    );
  });

  test("hydrate keeps existing status and avoids duplicate supported channels", () => {
    const hydrated = hydrateWorkspaceRcsOnboardingState(
      mergeWorkspaceMessagingOnboardingState(
        DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
        {
          selectedChannels: ["rcs"],
          messagingService: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
            serviceSid: "MG123",
            supportedChannels: ["rcs"],
          },
          rcs: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
            status: "in_review",
            regions: ["United States"],
            prerequisites: ["custom prerequisite"],
          },
        },
      ),
    );

    expect(hydrated.messagingService.supportedChannels).toEqual(["rcs"]);
    expect(hydrated.rcs.status).toBe("in_review");
    expect(hydrated.rcs.prerequisites).toEqual(["custom prerequisite"]);
  });

  test("updateWorkspaceRcsOnboarding persists merged state", async () => {
    const starting = {
      onboarding: mergeWorkspaceMessagingOnboardingState(
        DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
        {
          messagingService: {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
            serviceSid: "MG123",
          },
        },
      ),
    };
    const supabase = makeSupabase(starting);

    const result = await updateWorkspaceRcsOnboarding({
      supabaseClient: supabase as any,
      workspaceId: "w1",
      actorUserId: "u1",
      provider: null,
      displayName: "Acme Alerts",
      publicDescription: "Order and appointment updates",
      logoImageUrl: "https://example.test/logo.png",
      bannerImageUrl: "https://example.test/banner.png",
      accentColor: "#00AACC",
      optInPolicyImageUrl: "https://example.test/optin.png",
      useCaseVideoUrl: "https://example.test/video.mp4",
      representativeName: "Jane Doe",
      representativeTitle: "Director",
      representativeEmail: "jane@example.test",
      notificationEmail: "notify@example.test",
      agentId: "agent-1",
      senderId: "sender-1",
      regions: ["Canada"],
      notes: "Initial draft",
      status: "collecting_business",
    });

    expect(result.selectedChannels).toContain("rcs");
    expect(result.currentStep).toBe("provider_provisioning");
    expect(result.rcs.displayName).toBe("Acme Alerts");
    expect(result.rcs.provider).toBe("Twilio");
    expect(result.rcs.lastSubmittedAt).toMatch(/T/);
    expect(supabase._updateEq).toHaveBeenCalled();
  });

  test("updateWorkspaceRcsOnboarding throws on read/write errors", async () => {
    const selectError = new Error("select failed");
    const updateError = new Error("update failed");

    await expect(
      updateWorkspaceRcsOnboarding({
        supabaseClient: makeSupabase({}, { selectError }) as any,
        workspaceId: "w1",
        actorUserId: null,
        provider: null,
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
        agentId: null,
        senderId: null,
        regions: [],
        notes: "",
        status: "not_started",
      }),
    ).rejects.toThrow("select failed");

    await expect(
      updateWorkspaceRcsOnboarding({
        supabaseClient: makeSupabase({}, { updateError }) as any,
        workspaceId: "w1",
        actorUserId: null,
        provider: null,
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
        agentId: null,
        senderId: null,
        regions: [],
        notes: "",
        status: "not_started",
      }),
    ).rejects.toThrow("update failed");
  });
});
