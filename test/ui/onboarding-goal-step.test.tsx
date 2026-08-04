import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { OnboardingGoalStep } from "@/routes/workspaces+/$id/onboarding/OnboardingGoalStep";
import { OnboardingCreditsStep } from "@/routes/workspaces+/$id/onboarding/OnboardingCreditsStep";
import { OnboardingProgressStrip } from "@/routes/workspaces+/$id/onboarding/OnboardingProgressStrip";

const pending = {
  isSavingWorkspaceName: false,
  isSavingBusinessProfile: false,
  isSavingChannels: false,
  isProvisioningA2P: false,
  isSavingRcs: false,
  isAttachingRcsSender: false,
  isReviewingEmergencyVoice: false,
  isVerifyingCallerId: false,
};

function minimalOnboarding(
  overrides: Partial<WorkspaceMessagingOnboardingState> = {},
): WorkspaceMessagingOnboardingState {
  return {
    version: 3,
    status: "not_started",
    currentStep: "path_selection",
    operatingCountry: "CA",
    selectedChannels: [],
    selectedGoal: null,
    steps: [],
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
      sampleMessages: [],
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
    messagingService: {
      desiredSendMode: "messaging_service",
      serviceSid: null,
      friendlyName: null,
      provisioningStatus: "not_started",
      attachedSenderPhoneNumbers: [],
      supportedChannels: [],
      stickySenderEnabled: true,
      advancedOptOutEnabled: false,
      lastProvisionedAt: null,
      lastError: null,
    },
    subaccountBootstrap: {
      status: "not_started",
      authMode: "mixed",
      callbackBaseUrl: null,
      inboundVoiceUrl: null,
      inboundSmsUrl: null,
      statusCallbackUrl: null,
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
        countryCode: "CA",
        status: "not_started",
        validationError: null,
        lastValidatedAt: null,
      },
      lastReviewedAt: null,
    },
    a2p10dlc: {
      status: "not_started",
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
  };
}

function renderWithRouter(ui: ReactElement, initialEntry = "/") {
  const router = createMemoryRouter(
    [{ path: "/", element: ui }],
    { initialEntries: [initialEntry] },
  );
  return render(createElement(RouterProvider, { router }));
}

describe("goal-based onboarding UI", () => {
  test("goal step presents the three product goals", () => {
    renderWithRouter(
      createElement(OnboardingGoalStep, {
        onboarding: minimalOnboarding(),
        isReadOnly: false,
        pending,
      }),
    );

    expect(screen.getByText("What are you setting up?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Live call session/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /IVR/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /SMS blast/i })).toBeInTheDocument();
    expect(screen.queryByText("Choose channels")).toBeNull();
    expect(screen.queryByText("Provider setup")).toBeNull();
  });

  test("selecting SMS blast reveals concise number guidance", () => {
    renderWithRouter(
      createElement(OnboardingGoalStep, {
        onboarding: minimalOnboarding(),
        isReadOnly: false,
        pending,
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    expect(
      screen.getByText(/Toll-free is the higher-volume path/i),
    ).toBeInTheDocument();
  });

  test("toll-free verification fields stay hidden until the customer opts in", () => {
    const { container } = renderWithRouter(
      createElement(OnboardingGoalStep, {
        onboarding: minimalOnboarding(),
        isReadOnly: false,
        pending,
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    expect(screen.queryByText("Toll-free verification details")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Set Up Toll Free/i }));
    expect(screen.getByText("Toll-free verification details")).toBeInTheDocument();
    // DBA pre-fills from the legal business name captured on the first step.
    expect(screen.getByLabelText(/Doing business as/i)).toHaveValue("Acme");

    fireEvent.click(screen.getByRole("button", { name: /Continue with Local Number/i }));
    expect(screen.queryByText("Toll-free verification details")).toBeNull();

    const channelInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="selectedChannels"]'),
    ).map((input) => input.value);
    expect(channelInputs).toContain("local_number");
    expect(channelInputs).not.toContain("toll_free_bulk_sms");
  });

  test("progress strip shows step position without a credits readout", () => {
    renderWithRouter(
      createElement(OnboardingProgressStrip, {
        onboarding: minimalOnboarding({
          selectedGoal: "sms_blast",
          currentStep: "audience",
          steps: [
            {
              id: "audience",
              label: "Audience",
              status: "in_progress",
              description: null,
            },
          ],
        }),
        workspaceName: "Acme",
      }),
      "/?step=audience",
    );

    expect(screen.getByTestId("onboarding-step")).toBeInTheDocument();
    expect(screen.getByText("Setup: Acme")).toBeInTheDocument();
    expect(screen.getByText(/Step 4 of \d+ — Call list/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /4\. Call list/i })).toHaveAttribute(
      "href",
      expect.stringContaining("step=audience"),
    );
    expect(screen.queryByText(/Credits:/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Add credits/i })).toBeNull();
    expect(screen.queryByText(/Add credits before renting a number/i)).toBeNull();
  });

  test("progress strip stays hidden on the intro (no step param)", () => {
    renderWithRouter(
      createElement(OnboardingProgressStrip, {
        onboarding: minimalOnboarding(),
        workspaceName: "Acme",
      }),
    );

    expect(screen.queryByTestId("onboarding-step")).toBeNull();
  });

  test("credits step stays compact and actionable", () => {
    renderWithRouter(
      createElement(OnboardingCreditsStep, {
        workspaceId: "w1",
        creditsBalance: 12,
        isReadOnly: false,
      }),
    );

    expect(screen.getByText("12 credits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add credits/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to review/i })).toBeInTheDocument();
  });
});
