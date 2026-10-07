import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { OnboardingWizard } from "@/routes/workspaces+/$id/onboarding/OnboardingWizard";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { onboardingFixture } from "../fixtures/onboarding";

function renderGoal(overrides: Partial<WorkspaceMessagingOnboardingState> = {}) {
  const router = createMemoryRouter([{
    path: "/",
    element: <OnboardingWizard
      onboarding={onboardingFixture({ status: "ready", ...overrides })}
      workspaceId="w1" workspaceName="Acme" userRole="owner"
      phoneNumbers={[]} workspaceUsers={[]} mediaNames={[]}
      inboundQueues={[]} scripts={[]} creditsBalance={100}
      audienceCount={0} campaignCount={0}
      a2pBlockingIssues={[]} a2pErrors={[]} rcsBlockingIssues={[]}
      readiness={{
        shouldRedirectToOnboarding: false, shouldShowOnboardingBanner: false,
        messagingReady: true, voiceReady: true, legacyMode: false,
        sendMode: "messaging_service", messagingServiceSid: "MG_test",
        selectedChannels: [], currentStep: "path_selection", warnings: [],
      }}
      pending={{
        isSavingWorkspaceName: false, isSavingBusinessProfile: false,
        isSavingChannels: false, isProvisioningA2P: false, isSavingRcs: false,
        isAttachingRcsSender: false, isReviewingEmergencyVoice: false,
        isVerifyingCallerId: false,
      }}
    />,
  }], { initialEntries: ["/?step=path_selection"] });
  render(<RouterProvider router={router} />);
  return { router, submit: screen.getByRole("button", { name: "Save & continue" }) };
}

describe("goal selection and the wizard footer", () => {
  test("Canadian SMS requires a number path and resets it when the goal changes", () => {
    const { submit } = renderGoal();
    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Local Number/i }));
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /Live call session/i }));
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Set Up Toll Free/i }));
    expect(submit).toBeEnabled();
  });

  test("a saved Canadian SMS path is valid on the first render", () => {
    expect(renderGoal({ selectedGoal: "sms_blast", selectedChannels: ["local_number"] }).submit).toBeEnabled();
  });

  test("Canadian SMS without a saved path is invalid on the first render", () => {
    expect(renderGoal({ selectedGoal: "sms_blast" }).submit).toBeDisabled();
  });

  test("US SMS can continue without a Canadian toll-free choice", () => {
    const { submit } = renderGoal({ operatingCountry: "US" });
    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    expect(screen.queryByRole("group", { name: "SMS number path" })).toBeNull();
    expect(submit).toBeEnabled();
  });

  test("a valid draft and its footer stay together after leaving and returning", async () => {
    const { router } = renderGoal({ selectedGoal: "sms_blast" });
    fireEvent.click(screen.getByRole("radio", { name: /Live call session/i }));
    await act(async () => { await router.navigate("/?step=business_identity"); });
    await act(async () => { await router.navigate("/?step=path_selection"); });
    expect(screen.getByRole("radio", { name: /Live call session/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save & continue" })).toBeEnabled();
  });

  test("an incomplete SMS draft stays invalid after leaving and returning", async () => {
    const { router } = renderGoal({ selectedGoal: "ivr" });
    fireEvent.click(screen.getByRole("radio", { name: /SMS blast/i }));
    await act(async () => { await router.navigate("/?step=business_identity"); });
    await act(async () => { await router.navigate("/?step=path_selection"); });
    expect(screen.getByRole("radio", { name: /SMS blast/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save & continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Local Number/i }));
    expect(screen.getByRole("button", { name: "Save & continue" })).toBeEnabled();
  });

});
