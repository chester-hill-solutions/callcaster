import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import type { ComponentProps } from "react";
import { describe, expect, test } from "vitest";
import { OnboardingIntroStep } from "@/routes/workspaces+/$id/onboarding/OnboardingIntroStep";

function renderIntro(props: Partial<ComponentProps<typeof OnboardingIntroStep>> = {}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <OnboardingIntroStep
          workspaceName="Acme Outreach"
          isReadOnly={false}
          isSaving={false}
          {...props}
        />
      ),
      action: async () => null,
    },
  ]);
  render(<Stub />);
}

describe("OnboardingIntroStep", () => {
  test("asks for the workspace name as the first setup action", () => {
    renderIntro();

    expect(
      screen.getByRole("heading", { name: "Name your workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace name/i)).toHaveValue("Acme Outreach");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  test("surfaces a save error on the name form", () => {
    renderIntro({ error: "Enter a workspace name to continue." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a workspace name to continue.",
    );
  });
});
