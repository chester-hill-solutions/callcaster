import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SmokeRouter } from "./_helpers/component-smoke";

// Radix DropdownMenu uses portals/pointer events that jsdom does not model
// well. Flatten the primitives so the menu contents render inline and can be
// asserted directly.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

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

describe("app/components/layout/Navbar.tsx profile dropdown", () => {
  test("shows the invitation count as 'Invitations: N' with an open-mail icon", async () => {
    await renderNavbar(2);

    const link = screen.getByRole("link", { name: /Invitations: 2/ });
    expect(link).toHaveAttribute("href", "/accept-invite");
    expect(link.querySelector("svg.lucide-mail-open")).not.toBeNull();
  });

  test("drops the profile-info heading, first name, and workspace-settings link", async () => {
    await renderNavbar(1);

    expect(screen.queryByText("Profile Info:")).toBeNull();
    expect(screen.queryByText("Sam")).toBeNull();
    expect(screen.queryByText("Workspace settings")).toBeNull();
    expect(screen.getByText("user")).toBeInTheDocument();
  });
});
