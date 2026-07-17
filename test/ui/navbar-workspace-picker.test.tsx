import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DataSmokeRouter } from "./_helpers/component-smoke";

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));

// Radix DropdownMenu portals/pointer events are unreliable in jsdom; keep the
// menu content in-tree so destination/truncation contracts stay testable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) =>
    asChild ? (
      <div role="menuitem">{children}</div>
    ) : (
      <div role="menuitem">{children}</div>
    ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

const workspaces = [
  { id: "w1", name: "Alpha Workspace", role: "admin", credits: 42 },
  {
    id: "w2",
    name: "A Very Long Workspace Name That Should Truncate In The Trigger",
    role: "member",
    credits: null,
  },
];

async function renderNavbar(params: { id?: string } = { id: "w1" }) {
  const Navbar = (await import("@/components/layout/Navbar")).default;
  return render(
    <DataSmokeRouter>
      <Navbar
        handleSignOut={async () => ({ success: null, error: null })}
        workspaces={workspaces}
        isSignedIn
        user={{
          id: "u1",
          username: "user",
          first_name: "Sam",
          workspace_invite: [],
        }}
        params={params}
      />
    </DataSmokeRouter>,
  );
}

describe("Navbar workspace picker", () => {
  test("shows the active workspace name and authorized choices", async () => {
    await renderNavbar({ id: "w1" });

    const trigger = screen.getByTestId("navbar-workspace-picker");
    expect(trigger).toHaveAttribute(
      "aria-label",
      "Switch workspace, current: Alpha Workspace",
    );
    const activeLabel = within(trigger).getByText("Alpha Workspace");
    expect(activeLabel.className).toContain("truncate");

    const alpha = screen.getByRole("link", { name: "Alpha Workspace" });
    const longName = screen.getByRole("link", {
      name: "A Very Long Workspace Name That Should Truncate In The Trigger",
    });
    expect(alpha).toHaveAttribute("href", "/workspaces/w1");
    expect(longName).toHaveAttribute("href", "/workspaces/w2");
    expect(within(longName).getByText(/A Very Long Workspace Name/)).toHaveClass(
      "truncate",
    );
    expect(screen.getByRole("link", { name: "All workspaces" })).toHaveAttribute(
      "href",
      "/workspaces",
    );
  });

  test("shows Admin+ credits for the active workspace and hides them for members", async () => {
    const { unmount } = await renderNavbar({ id: "w1" });
    expect(screen.getByTestId("navbar-credits")).toHaveTextContent("42");
    unmount();

    await renderNavbar({ id: "w2" });
    expect(screen.queryByTestId("navbar-credits")).toBeNull();
  });

  test("mobile menu lists the same workspace destinations", async () => {
    await renderNavbar({ id: "w1" });

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const alpha = screen.getByRole("link", { name: "Alpha Workspace" });
    const longName = screen.getByRole("link", {
      name: "A Very Long Workspace Name That Should Truncate In The Trigger",
    });
    // Desktop picker already rendered the same hrefs; mobile Sheet adds its list.
    expect(alpha).toHaveAttribute("href", "/workspaces/w1");
    expect(longName).toHaveAttribute("href", "/workspaces/w2");
    expect(longName.className).toContain("truncate");
  });
});
