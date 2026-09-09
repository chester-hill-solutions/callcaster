import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { onboardingFixture as minimalOnboarding } from "../fixtures/onboarding";
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
    expect(screen.getByRole("radio", { name: /Automated phone menu/i })).toBeInTheDocument();
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
    // The guidance is the explanation; no tooltip repeats it (#1148).
    expect(screen.queryByRole("button", { name: "More information" })).toBeNull();
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
