import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";

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
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div role="menuitem">{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

// Same treatment for the workspace-picker combobox primitives: Radix Popover
// portals and react-aria Autocomplete internals don't run in jsdom, so render
// them in-tree and surface each item's onAction as a plain click handler.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  CommandGroup: ({
    children,
    heading,
  }: {
    children: React.ReactNode;
    heading?: string;
  }) => (
    <div>
      {heading ? <div>{heading}</div> : null}
      {children}
    </div>
  ),
  CommandItem: ({
    children,
    textValue,
    onAction,
    className,
  }: {
    children: React.ReactNode;
    textValue?: string;
    onAction?: () => void;
    className?: string;
  }) => (
    <button type="button" role="menuitem" aria-label={textValue} onClick={onAction} className={className}>
      {children}
    </button>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

async function renderNavbar(params: { id?: string } = { id: "w1" }) {
  const Navbar = (await import("@/components/layout/Navbar")).default;
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <>
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
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Navbar workspace picker", () => {
  test("shows the active workspace name and searchable choices that navigate", async () => {
    await renderNavbar({ id: "w1" });

    const trigger = screen.getByTestId("navbar-workspace-picker");
    expect(trigger).toHaveAttribute(
      "aria-label",
      "Switch workspace, current: Alpha Workspace",
    );
    expect(trigger).toHaveAttribute("role", "combobox");
    const activeLabel = within(trigger).getByText("Alpha Workspace");
    expect(activeLabel.className).toContain("truncate");

    expect(screen.getByPlaceholderText("Search workspaces…")).toBeInTheDocument();

    const longName = screen.getByRole("menuitem", {
      name: "A Very Long Workspace Name That Should Truncate In The Trigger",
    });
    expect(within(longName).getByText(/A Very Long Workspace Name/)).toHaveClass(
      "truncate",
    );

    fireEvent.click(longName);
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/workspaces/w2");

    fireEvent.click(screen.getByRole("menuitem", { name: "All workspaces" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/workspaces");
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
