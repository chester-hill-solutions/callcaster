import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";

// Regression test for audit-F's "no skip-to-content link" finding: keyboard
// users had to tab through the entire (unbounded) workspace sidebar before
// reaching any page's actual content. This asserts:
//   1. the skip link's href fragment resolves to a real element in the
//      rendered tree (not just a hardcoded string match — derives the target
//      id from the href itself, so a broken/renamed target fails loudly),
//   2. that target is the actual <main> landmark, focusable via tabindex=-1
//      (a plain <div> id wouldn't receive focus when the link is activated),
//   3. WorkspaceNav's sidebar is NOT inside <main> — it needs to precede/be
//      a sibling of it, otherwise jumping to <main> would still land you at
//      the top of a landmark that has the sidebar as its first child, and
//      the very next Tab would go right back into the sidebar.
const mocks = vi.hoisted(() => ({
  revalidate: vi.fn(),
}));

vi.mock("@/routes/workspaces+/$id.loader.server", () => ({
  loader: vi.fn(),
}));

vi.mock("@/routes/workspaces+/$id.middleware.server", () => ({
  middleware: [],
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return {
    ...actual,
    useLoaderData: () => ({
      userRole: "admin",
      workspaceData: {
        workspace: { id: "ws-1", name: "Workspace One", credits: 0 },
        audiences: [],
        campaigns: [{ id: 20, title: "Loader campaign" }],
        phoneNumbers: [{ id: 30 }],
      },
      onboardingReadiness: {
        shouldShowOnboardingBanner: false,
        shouldRedirectToOnboarding: false,
        warnings: [],
      },
      today: {
        kind: "add_credits",
        href: "/workspaces/ws-1/billing",
        unreadCount: 0,
        runningCampaignTitle: null,
      },
    }),
    // Falsy on purpose: react-router's real <Outlet> needs a live route
    // match to render anything, which this bare `render()` (no
    // RouterProvider) doesn't have. Matching the working pattern in
    // workspace-realtime-revalidation.test.tsx, useOutlet: () => null takes
    // the WorkspaceToday branch instead, giving real, assertable content.
    useOutlet: () => null,
    useOutletContext: () => ({}),
    useRevalidator: () => ({ revalidate: mocks.revalidate }),
    // No onboarding child match in these bare renders, so the layout skips
    // the onboarding progress strip.
    useMatches: () => [],
    useLocation: () => ({ pathname: "/workspaces/ws-1" }),
  };
});

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));

vi.mock("@/components/workspace/WorkspaceNav", () => ({
  default: () => <nav data-testid="workspace-nav">Sidebar with many links</nav>,
}));

vi.mock("@/components/workspace/WorkspaceToday", () => ({
  default: () => (
    <div data-testid="page-content">
      <a href="/workspaces/ws-1/billing">Add credits</a>
    </div>
  ),
}));

describe("workspaces+/$id.tsx skip-to-content link", () => {
  test("the skip link's href resolves to a real, focusable <main> element", () => {
    render(<Workspace />);

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink.className).toMatch(/sr-only/);

    const href = skipLink.getAttribute("href") ?? "";
    expect(href).toMatch(/^#.+/);
    const targetId = href.slice(1);

    const target = document.getElementById(targetId);
    expect(target).not.toBeNull();
    expect(target!.tagName).toBe("MAIN");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  test("the sidebar nav is not nested inside <main> and precedes it in document order", () => {
    render(<Workspace />);
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    const targetId = (skipLink.getAttribute("href") ?? "").slice(1);
    const main = document.getElementById(targetId)!;
    const nav = screen.getByTestId("workspace-nav");

    // If the nav were still main's first child (the pre-fix structure),
    // jumping focus to <main> wouldn't actually skip it: the very next Tab
    // would land back on the sidebar's first link.
    expect(main.contains(nav)).toBe(false);

    // Node.DOCUMENT_POSITION_FOLLOWING (4): nav comes after skipLink.
    // eslint-disable-next-line no-bitwise
    expect(
      skipLink.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(
      nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("keeps the depleted-credit banner passive at the workspace root", () => {
    render(<Workspace />);
    const main = document.getElementById("workspace-main-content")!;

    expect(main).toHaveTextContent("Credit balance is depleted");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(main.querySelectorAll("a")).toHaveLength(1);
    expect(main.querySelector("a")).toHaveTextContent("Add credits");
  });
});
