import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { OnboardingGoalStep } from "@/routes/workspaces+/$id/onboarding/OnboardingGoalStep";
import { OnboardingCreditsStep } from "@/routes/workspaces+/$id/onboarding/OnboardingCreditsStep";
import { OnboardingOverviewCard } from "@/routes/workspaces+/$id/onboarding/OnboardingOverviewCard";

const pending = {
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

function renderWithRouter(ui: ReactElement) {
  const router = createMemoryRouter(
    [{ path: "/", element: ui }],
    { initialEntries: ["/"] },
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
      screen.getByText(/For texting at higher volume, a toll-free number/i),
    ).toBeInTheDocument();
  });

  test("overview shows compact credits link instead of a large alert", () => {
    renderWithRouter(
      createElement(OnboardingOverviewCard, {
        onboarding: minimalOnboarding({
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
        workspaceId: "w1",
        creditsBalance: 0,
        activeStep: "audience",
        visibleSteps: ["business_profile", "path_selection", "audience", "first_number"],
        stepIndex: 2,
        progressValue: 50,
      }),
    );

    expect(screen.getByText(/Credits:/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add credits/i })).toBeInTheDocument();
    expect(screen.queryByText(/Add credits before renting a number/i)).toBeNull();
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
