import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
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

function onboarding(
  overrides: {
    selectedGoal?: WorkspaceMessagingOnboardingState["selectedGoal"];
    selectedChannels?: WorkspaceMessagingOnboardingState["selectedChannels"];
    websiteUrl?: string;
    businessProfile?: Partial<
      WorkspaceMessagingOnboardingState["businessProfile"]
    >;
  } = {},
): WorkspaceMessagingOnboardingState {
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

const idlePending = {
  isSavingWorkspaceName: false,
  isSavingBusinessProfile: false,
  isSavingChannels: false,
  isProvisioningA2P: false,
  isSavingRcs: false,
  isAttachingRcsSender: false,
  isReviewingEmergencyVoice: false,
  isVerifyingCallerId: false,
};
function renderStep(
  o: WorkspaceMessagingOnboardingState,
  overrides: Partial<
    ComponentProps<typeof OnboardingBusinessIdentityStep>
  > = {},
): void {
  render(
    <OnboardingBusinessIdentityStep
      onboarding={o}
      isReadOnly={false}
      pending={idlePending}
      {...overrides}
    />,
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
  test("toll-free consent starts unselected and uses the exact form value", () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
      }),
    );
    expect(
      screen.getByRole("combobox", {
        name: /how do customers consent to sms/i,
      }),
    ).toHaveTextContent("Choose a consent method");
    const form = document.getElementById(
      "onboarding-business-identity-form",
    ) as HTMLFormElement;
    expect(new FormData(form).get("tollFreeOptInType")).toBe("");
  });
  test("a saved website selection retains its label and exact submitted value", () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["toll_free_bulk_sms"],
        businessProfile: { tollFreeOptInType: "WEB_FORM" },
      }),
    );
    expect(
      screen.getByRole("combobox", {
        name: /how do customers consent to sms/i,
      }),
    ).toHaveTextContent("Website form");
    const form = document.getElementById(
      "onboarding-business-identity-form",
    ) as HTMLFormElement;
    expect(new FormData(form).get("tollFreeOptInType")).toBe("WEB_FORM");
  });
  test("a voice identity form does not add a consent attestation", () => {
    renderStep(
      onboarding({
        selectedGoal: "live_calling",
        selectedChannels: ["voice_compliance"],
      }),
    );
    expect(
      screen.queryByRole("combobox", {
        name: /how do customers consent to sms/i,
      }),
    ).not.toBeInTheDocument();
    const form = document.getElementById(
      "onboarding-business-identity-form",
    ) as HTMLFormElement;
    expect(new FormData(form).has("tollFreeOptInType")).toBe(false);
  });
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

    expect(
      screen.getByText("Toll-free verification details"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/doing business as/i)).toHaveValue(
      "Northgate",
    );
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

    expect(
      screen.getByText("US brand registration details"),
    ).toBeInTheDocument();
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
    renderStep(
      onboarding({ selectedGoal: "sms_blast", websiteUrl: "sai.com" }),
    );
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
    renderStep(
      onboarding({ selectedGoal: "live_calling", websiteUrl: "sai.com" }),
    );
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

describe("A2P business controls (#2282)", () => {
  test("new company selection is empty and public controls stay mounted but disabled", () => {
    renderStep(
      onboarding({ selectedGoal: "sms_blast", selectedChannels: ["a2p10dlc"] }),
    );
    expect(
      screen.getByRole("combobox", { name: /company type/i }),
    ).toHaveTextContent("Choose a company type");
    const form = document.getElementById(
      "onboarding-business-identity-form",
    ) as HTMLFormElement;
    expect(new FormData(form).get("a2pCompanyType")).toBe("");
    expect(screen.getByLabelText(/stock ticker/i)).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: /stock exchange/i }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText(/brand representative organization email/i),
    ).toBeDisabled();
    expect(new FormData(form).has("a2pBrandContactEmail")).toBe(false);
  });
  test("public selection enables required controls and submits exact values", async () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["a2p10dlc"],
        businessProfile: {
          a2pStockExchange: "TSX",
          a2pStockTicker: "ACME",
          a2pBrandContactEmail: "jordan@acme.example",
        },
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /company type/i }));
    await user.click(
      await screen.findByRole("option", { name: "Publicly traded" }),
    );
    expect(screen.getByLabelText(/stock ticker/i)).toBeRequired();
    expect(
      screen.getByLabelText(/brand representative organization email/i),
    ).toBeRequired();
    const form = document.getElementById(
      "onboarding-business-identity-form",
    ) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      a2pCompanyType: "public",
      a2pStockExchange: "TSX",
      a2pStockTicker: "ACME",
      a2pBrandContactEmail: "jordan@acme.example",
    });
  });
  test.each(["isSavingBusinessProfile", "isProvisioningA2P"] as const)(
    "%s disables the custom company selection and public writes",
    async (busy) => {
      renderStep(
        onboarding({
          selectedGoal: "sms_blast",
          selectedChannels: ["a2p10dlc"],
          businessProfile: {
            a2pCompanyType: "public",
            a2pStockExchange: "NASDAQ",
            a2pStockTicker: "ACME",
            a2pBrandContactEmail: "jordan@acme.example",
          },
        }),
        { pending: { ...idlePending, [busy]: true } },
      );
      const company = screen.getByRole("combobox", { name: /company type/i });
      expect(company).toHaveAttribute("disabled");
      await userEvent.setup().click(company);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(company).toHaveTextContent("Publicly traded");
      expect(screen.getByLabelText(/stock ticker/i)).toHaveAttribute(
        "disabled",
      );
      expect(
        screen.getByLabelText(/brand representative organization email/i),
      ).toHaveAttribute("disabled");
    },
  );
  test("read-only public identity disables all four inputs without dropping the saved values", () => {
    renderStep(
      onboarding({
        selectedGoal: "sms_blast",
        selectedChannels: ["a2p10dlc"],
        businessProfile: {
          a2pCompanyType: "public",
          a2pStockExchange: "NASDAQ",
          a2pStockTicker: "ACME",
          a2pBrandContactEmail: "jordan@acme.example",
        },
      }),
      { isReadOnly: true },
    );
    expect(
      screen.getByRole("combobox", { name: /company type/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: /stock exchange/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/stock ticker/i)).toHaveValue("ACME");
    expect(
      screen.getByLabelText(/brand representative organization email/i),
    ).toHaveValue("jordan@acme.example");
  });
});
