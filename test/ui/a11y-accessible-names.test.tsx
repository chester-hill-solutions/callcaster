import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SmokeRouter } from "./_helpers/component-smoke";

describe("app/components/layout/Navbar.tsx user menu", () => {
  async function renderNavbar(inviteCount: number) {
    const Navbar = (await import("@/components/layout/Navbar")).default;
    render(
      <SmokeRouter>
        <Navbar
          handleSignOut={async () => ({ success: null, error: null })}
          workspaces={[{ id: "w1", name: "WS" } as never]}
          isSignedIn
          user={
            {
              id: "u1",
              username: "user",
              first_name: "Sam",
              workspace_invite: Array.from({ length: inviteCount }, (_, i) => ({
                id: String(i),
              })),
            } as never
          }
          params={{ id: "w1" }}
        />
      </SmokeRouter>,
    );
  }

  test("the icon-only user menu trigger exposes an accessible name", async () => {
    await renderNavbar(0);
    expect(
      screen.getByRole("button", { name: "Account menu" }),
    ).toBeInTheDocument();
  });

  test("the pending-invite count is folded into the accessible name, not left as a bare badge", async () => {
    await renderNavbar(2);
    expect(
      screen.getByRole("button", {
        name: "Account menu, 2 pending invitations",
      }),
    ).toBeInTheDocument();
  });

  test("the user menu keeps a readable foreground token in dark mode", async () => {
    // The navbar surface stays pale brand-blue in both themes, so a real
    // contrast ratio cannot be computed in jsdom (no stylesheet resolution).
    // Assert the token instead: dark:text-secondary-foreground was near-black
    // text on a near-black button (~1.4:1).
    await renderNavbar(0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger.className).not.toContain("dark:text-secondary-foreground");
    expect(trigger.className).toContain("dark:text-brand-secondary");
    expect(trigger.className).toContain("text-brand-primary");
  });
});

describe("app/components/sms-ui/ChatInput.tsx attach control", () => {
  test("the image attach control exposes an accessible name", async () => {
    const ChatInput = (await import("@/components/sms-ui/ChatInput")).default;
    render(
      <ChatInput
        {...({
          workspace: {
            id: "w1",
            name: "W",
            owner: null,
            users: null,
            created_at: "",
          },
          workspaceNumbers: [{ id: "1", phone_number: "+15550000000" }],
          senderSelection: {
            defaultMode: "from_number",
            messagingServiceReady: false,
          },
          initialFrom: "+15550000000",
          handleSubmit: vi.fn(),
          handleImageSelect: vi.fn(),
          handleImageRemove: vi.fn(),
          selectedImages: [],
          selectedContact: null,
          messageFetcher: {
            state: "idle",
            data: undefined,
            Form: "form",
          },
          phoneNumber: "+15551234567",
          isValid: true,
        } as unknown as React.ComponentProps<typeof ChatInput>)}
      />,
    );
    // The <label> names the file input, so querying by role covers both.
    expect(screen.getByLabelText("Attach image")).toBeInTheDocument();
  });
});

describe("app/components/ui/progress.tsx", () => {
  test("forwards value so the progressbar reports aria-valuenow", async () => {
    const { Progress } = await import("@/components/ui/progress");
    render(<Progress value={40} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  test("omits aria-valuenow when the value is indeterminate", async () => {
    const { Progress } = await import("@/components/ui/progress");
    render(<Progress />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
  });
});

describe("app/components/ui/form-field.tsx", () => {
  test("FormFieldControl wires the error onto the control, not a wrapper div", async () => {
    const { FormField, FormFieldControl } = await import(
      "@/components/ui/form-field"
    );
    const { Input } = await import("@/components/ui/input");
    render(
      <FormField htmlFor="email" label="Email" error="User not found">
        <FormFieldControl>
          <Input id="email" name="email" />
        </FormFieldControl>
      </FormField>,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "User not found",
    );
  });

  test("a field without an error is not marked invalid", async () => {
    const { FormField, FormFieldControl } = await import(
      "@/components/ui/form-field"
    );
    const { Input } = await import("@/components/ui/input");
    render(
      <FormField htmlFor="email" label="Email" description="Work address">
        <FormFieldControl>
          <Input id="email" name="email" />
        </FormFieldControl>
      </FormField>,
    );

    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Work address",
    );
  });
});

describe("app/components/shared/BrandedCard.tsx", () => {
  test("BrandedCardTitle defaults to h2 for cards nested under a page heading", async () => {
    const { BrandedCardTitle } = await import("@/components/shared/BrandedCard");
    render(<BrandedCardTitle>Add Script</BrandedCardTitle>);
    expect(
      screen.getByRole("heading", { level: 2, name: "Add Script" }),
    ).toBeInTheDocument();
  });

  test("BrandedCardTitle can be the page h1 when the card is the whole page", async () => {
    const { BrandedCardTitle } = await import("@/components/shared/BrandedCard");
    render(<BrandedCardTitle as="h1">Add Script</BrandedCardTitle>);
    expect(
      screen.getByRole("heading", { level: 1, name: "Add Script" }),
    ).toBeInTheDocument();
  });
});
