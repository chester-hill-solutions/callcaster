import { fireEvent, render, screen } from "@testing-library/react";
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
import { onboardingFixture } from "../fixtures/onboarding";

function onboarding(overrides: {
  selectedGoal?: WorkspaceMessagingOnboardingState["selectedGoal"];
  selectedChannels?: WorkspaceMessagingOnboardingState["selectedChannels"];
  websiteUrl?: string;
  businessProfile?: Partial<WorkspaceMessagingOnboardingState["businessProfile"]>;
} = {}): WorkspaceMessagingOnboardingState {
  const base = onboardingFixture();
  return {
    ...base,
    selectedGoal: overrides.selectedGoal ?? null,
    selectedChannels: overrides.selectedChannels ?? [],
    operatingCountry: "US",
    businessProfile: {
      ...base.businessProfile,
      legalBusinessName: "",
      websiteUrl: overrides.websiteUrl ?? "",
      ...overrides.businessProfile,
    },
  };
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
    expect(label?.querySelector(".text-destructive-text")).toBeNull();
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
    expect(label?.querySelector(".text-destructive-text")).not.toBeNull();
  });

  test("goal is null (initial state): website is optional (nothing has demanded it yet)", () => {
    renderStep(onboarding({ selectedGoal: null }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.required).toBe(false);
  });
});

describe("OnboardingBusinessIdentityStep — SMS identity fields (#1148)", () => {
  test("shows toll-free business fields only for the selected SMS channel", () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
        businessProfile: {
          legalBusinessName: "Northgate Services",
          doingBusinessAs: "Northgate",
          businessRegistrationNumber: "123456789RC0001",
          sampleMessages: ["Northgate: your appointment is tomorrow."],
        },
      }),
    );

    expect(screen.getByText("Toll-free verification details")).toBeInTheDocument();
    expect(screen.getByLabelText(/doing business as/i)).toHaveValue("Northgate");
    expect(screen.getByLabelText(/business registration number/i)).toHaveValue(
      "123456789RC0001",
    );
    expect(screen.getByLabelText("Sample messages")).toHaveValue(
      "Northgate: your appointment is tomorrow.",
    );
    expect(screen.queryByText("US brand registration details")).toBeNull();
  });

  test("shows US registration fields only for the selected A2P channel", () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["a2p10dlc"],
        businessProfile: {
          ein: "12-3456789",
          industry: "Healthcare",
          authorizedRepName: "Jordan Smith",
        },
      }),
    );

    expect(screen.getByText("US brand registration details")).toBeInTheDocument();
    expect(screen.getByLabelText(/ein/i)).toHaveValue("12-3456789");
    expect(screen.getByLabelText("Industry")).toHaveValue("Healthcare");
    expect(screen.getByLabelText("Authorized representative name")).toHaveValue(
      "Jordan Smith",
    );
    expect(screen.queryByText("Toll-free verification details")).toBeNull();
  });

  test("hides SMS business fields when the goal is not SMS", () => {
    renderStep(
      onboarding({
        selectedGoal: "live_call",
        selectedChannels: ["toll_free_bulk_sms", "a2p10dlc"],
      }),
    );

    expect(screen.queryByText("Toll-free verification details")).toBeNull();
    expect(screen.queryByText("US brand registration details")).toBeNull();
  });
});

describe("OnboardingBusinessIdentityStep — format vs required errors (#1122)", () => {
  test("SMS goal + malformed URL: reports a format error, not 'required'", () => {
    renderStep(onboarding({ selectedGoal: "sms_blast", websiteUrl: "sai.com" }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.validity.typeMismatch).toBe(true);
    fireEvent.invalid(input);
    expect(
      screen.getByText(/enter a valid url, e\.g\. https:\/\/example\.com\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/website url is required\./i)).toBeNull();
  });

  test("SMS goal + empty URL: still reports the required error", () => {
    renderStep(onboarding({ selectedGoal: "sms_blast" }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.validity.valueMissing).toBe(true);
    fireEvent.invalid(input);
    expect(screen.getByText(/website url is required\./i)).toBeInTheDocument();
  });

  test("optional field + malformed URL: shows the format error in-page and clears on edit", () => {
    renderStep(onboarding({ selectedGoal: "live_calling", websiteUrl: "sai.com" }));
    const input = screen.getByLabelText(/website url/i) as HTMLInputElement;
    expect(input.required).toBe(false);
    fireEvent.invalid(input);
    expect(
      screen.getByText(/enter a valid url, e\.g\. https:\/\/example\.com\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/website url is required\./i)).toBeNull();

    fireEvent.change(input, { target: { value: "https://sai.com" } });
    expect(
      screen.queryByText(/enter a valid url, e\.g\. https:\/\/example\.com\./i),
    ).toBeNull();
  });
});
