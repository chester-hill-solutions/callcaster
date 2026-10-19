import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { Tabs } from "@/components/ui/tabs";
import { AdminSystemSettingsPanel } from "@/routes/admin+/panels/AdminSystemSettingsPanel";
import type { VerificationNumberRow } from "@/routes/admin+/admin.types";

function renderPanel(verificationNumbers: VerificationNumberRow[]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Tabs value="settings">
            <AdminSystemSettingsPanel verificationNumbers={verificationNumbers} />
          </Tabs>
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const active: VerificationNumberRow = {
  phoneNumber: "+18005550199",
  providerSid: "PN1",
  label: "Main",
  region: "ca-central",
  isActive: true,
};

const inactive: VerificationNumberRow = {
  phoneNumber: "+18005550198",
  providerSid: null,
  label: null,
  region: null,
  isActive: false,
};

describe("admin call-in verification numbers (#2519)", () => {
  test("with no registered number it explains the feature is unavailable", () => {
    renderPanel([]);
    expect(
      screen.getByText(/No verification number is registered/i),
    ).toBeInTheDocument();
  });

  test("only an inactive number offers the activate control", () => {
    renderPanel([active, inactive]);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    const activateButtons = screen.getAllByRole("button", { name: "Set active" });
    expect(activateButtons).toHaveLength(1);

    const activateForm = activateButtons[0]?.closest("form");
    expect(activateForm).not.toBeNull();
    expect(within(activateForm as HTMLElement).getByDisplayValue("+18005550198")).toBeInTheDocument();
    expect(
      within(activateForm as HTMLElement).getByDisplayValue("activate_verification_number"),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
  });

  test("the register form posts a new number", () => {
    renderPanel([]);

    const registerForm = screen.getByRole("button", { name: "Register" }).closest("form");
    expect(registerForm).not.toBeNull();
    expect(
      within(registerForm as HTMLElement).getByDisplayValue("register_verification_number"),
    ).toBeInTheDocument();
    expect(within(registerForm as HTMLElement).getByLabelText(/Phone number/i)).toBeInTheDocument();
  });

  test("registered but inactive numbers warn the feature stays unavailable", () => {
    renderPanel([inactive]);
    expect(screen.getByText(/No number is active/i)).toBeInTheDocument();
  });
});
