import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ComponentProps } from "react";
import { describe, expect, test } from "vitest";
import { OnboardingWizard } from "@/routes/workspaces+/$id/onboarding/OnboardingWizard";
import { OnboardingLaunchStep } from "@/routes/workspaces+/$id/onboarding/OnboardingLaunchStep";
import { onboardingFixture, onboardingNumberFixture } from "../fixtures/onboarding";

type Props = ComponentProps<typeof OnboardingLaunchStep>;

function renderReview(overrides: Partial<Props> = {}, inWizard = false) {
  const props: Props = {
    onboarding: onboardingFixture({ selectedGoal: "ivr", status: "ready" }),
    workspaceId: "w1", phoneNumbers: [], audienceCount: 0, campaignCount: 0,
    scriptCount: 0, creditsBalance: 0,
    readiness: {
      shouldRedirectToOnboarding: false, shouldShowOnboardingBanner: false,
      messagingReady: true, voiceReady: true, legacyMode: false,
      sendMode: "messaging_service", messagingServiceSid: "MG_test",
      selectedChannels: [], currentStep: "launch_checks", warnings: [],
    },
    ...overrides,
  };
  const router = createMemoryRouter([{
    path: "/", element: inWizard ? <OnboardingWizard
      {...props}
      workspaceName="Acme"
      userRole="owner"
      workspaceUsers={[]}
      mediaNames={[]}
      inboundQueues={[]}
      scripts={[{ id: 1, name: "First script" }]}
      rcsBlockingIssues={[]}
      a2pBlockingIssues={[]}
      a2pErrors={[]}
      pending={{
        isSavingWorkspaceName: false, isSavingBusinessProfile: false, isSavingChannels: false,
        isProvisioningA2P: false, isSavingRcs: false, isAttachingRcsSender: false,
        isReviewingEmergencyVoice: false, isVerifyingCallerId: false,
      }}
    /> : <OnboardingLaunchStep {...props} />,
  }], { initialEntries: ["/?step=launch_checks"] });
  render(<RouterProvider router={router} />);
}

const readyResources = {
  phoneNumbers: [onboardingNumberFixture()], audienceCount: 1,
  campaignCount: 1, scriptCount: 1, creditsBalance: 100,
};

describe("setup review (#1745)", () => {
  test("shows missing resources and links each to its setup step", () => {
    renderReview();
    expect(screen.getByRole("heading", { name: "Review your setup" })).toBeVisible();
    expect(screen.queryByText("Ready to launch")).toBeNull();
    expect(screen.getByText("2 of 7 setup items complete")).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/workspaces/w1/onboarding?step=audience");
    for (const [label, step] of [
      ["Add contacts", "audience"], ["Connect a phone number", "first_number"],
      ["Create a script", "script"], ["Create a campaign", "campaign_info"], ["Add credits", "credits"],
    ]) {
      expect(screen.getByRole("link", { name: `Set up: ${label}` })).toHaveAttribute("href", `/workspaces/w1/onboarding?step=${step}`);
    }
  });

  test("completed items remain reviewable and one primary action opens the workspace", () => {
    renderReview(readyResources);
    expect(screen.getByText("7 of 7 setup items complete")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Go to workspace" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Continue setup" })).toBeNull();
    expect(screen.getByRole("link", { name: "Review: Connect a phone number" })).toHaveAttribute("href", "/workspaces/w1/onboarding?step=first_number");
    expect(within(screen.getByRole("list", { name: "Setup checklist" })).getAllByText("Complete")).toHaveLength(7);
  });

  test("rent-number-only setup does not ask for contacts, scripts, or campaigns", () => {
    renderReview({
      onboarding: onboardingFixture({ selectedGoal: "rent_number" }),
      phoneNumbers: [onboardingNumberFixture()], creditsBalance: 100,
    });
    expect(screen.getByText("4 of 4 setup items complete")).toBeVisible();
    expect(screen.queryByText("Add contacts")).toBeNull();
    expect(screen.queryByText("Create a script")).toBeNull();
    expect(screen.queryByText("Create a campaign")).toBeNull();
  });

  test("live calling does not require a script and missing credits remain actionable", () => {
    renderReview({ ...readyResources, scriptCount: 0, creditsBalance: 0,
      onboarding: onboardingFixture({ selectedGoal: "live_call" }),
    });
    expect(screen.queryByText("Create a script")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/workspaces/w1/onboarding?step=credits");
  });

  test("keeps warnings visible even when all setup resources exist", () => {
    renderReview({ ...readyResources, readiness: {
      shouldRedirectToOnboarding: false, shouldShowOnboardingBanner: true,
      messagingReady: false, voiceReady: false, legacyMode: false,
      sendMode: "from_number", messagingServiceSid: null, selectedChannels: [],
      currentStep: "launch_checks", warnings: ["Messaging registration is pending."],
    } });
    expect(screen.getByRole("region", { name: "Before you start" })).toHaveTextContent("Messaging registration is pending.");
    expect(screen.queryByText(/meets the current readiness checks/)).toBeNull();
  });

  test("the wizard footer does not duplicate the review screen workspace action", () => {
    renderReview(readyResources, true);
    expect(screen.getAllByRole("link", { name: "Go to workspace" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Go to workspace" })).toBeNull();
  });

  test("a missing business name directs the user back to identity", () => {
    const onboarding = onboardingFixture({ selectedGoal: "ivr" });
    onboarding.businessProfile.legalBusinessName = "";
    renderReview({ ...readyResources, onboarding });
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/workspaces/w1/onboarding?step=business_identity");
  });
});
