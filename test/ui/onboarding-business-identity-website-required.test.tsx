import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// react-router's <Form> requires a data router; the assertions here don't
// touch submission, so stub Form to a plain <form> and skip the router setup.
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  };
});

import { OnboardingBusinessIdentityStep } from "@/routes/workspaces+/$id/onboarding/OnboardingBusinessIdentityStep";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

function onboarding(overrides: {
  selectedGoal?: WorkspaceMessagingOnboardingState["selectedGoal"];
  websiteUrl?: string;
} = {}): WorkspaceMessagingOnboardingState {
  return {
    selectedGoal: overrides.selectedGoal ?? null,
    selectedChannels: [],
    operatingCountry: "US",
    businessProfile: {
      legalBusinessName: "",
      websiteUrl: overrides.websiteUrl ?? "",
    },
  } as unknown as WorkspaceMessagingOnboardingState;
}

function renderStep(o: WorkspaceMessagingOnboardingState): void {
  render(
    <OnboardingBusinessIdentityStep onboarding={o} isReadOnly={false} pending={false} />,
  );
}

describe("OnboardingBusinessIdentityStep — Website URL required only for SMS (#1311)", () => {
  test("goal is not SMS: website input is NOT required and the description reads optional", () => {
    renderStep(onboarding({ selectedGoal: "live_calling" }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.required).toBe(false);
    // Optional description hints that a later SMS goal switch will demand it.
    expect(
      screen.getByText(
        /optional\. only required later if you switch to a goal that sends sms\./i,
      ),
    ).toBeInTheDocument();
    // No red asterisk on the label.
    const label = document.querySelector('label[for="websiteUrl"]');
    expect(label?.querySelector(".text-destructive")).toBeNull();
  });

  test("goal is SMS blast: website input IS required, description flips to required copy, red asterisk appears", () => {
    renderStep(onboarding({ selectedGoal: "sms_blast" }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(
      screen.getByText(
        /required — carriers ask for it during sms registration\./i,
      ),
    ).toBeInTheDocument();
    const label = document.querySelector('label[for="websiteUrl"]');
    expect(label?.querySelector(".text-destructive")).not.toBeNull();
  });

  test("goal is null (initial state): website is optional (nothing has demanded it yet)", () => {
    renderStep(onboarding({ selectedGoal: null }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.required).toBe(false);
  });
});
