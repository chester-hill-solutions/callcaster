import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";

// The workspace sidebar stays hidden only while the onboarding wizard child
// route is active. Workspace pages remain navigable while onboarding is
// incomplete, including when the workspace has no phone number yet.
const mocks = vi.hoisted(() => ({
  revalidate: vi.fn(),
  state: {
    shouldRedirectToOnboarding: false,
    matches: [] as Array<{ loaderData: unknown }>,
  },
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
        workspace: { id: "ws-1", name: "Workspace One", credits: 100 },
        audiences: [],
        campaigns: [],
        phoneNumbers: [],
      },
      onboardingReadiness: {
        shouldShowOnboardingBanner: mocks.state.shouldRedirectToOnboarding,
        shouldRedirectToOnboarding: mocks.state.shouldRedirectToOnboarding,
        warnings: [],
      },
    }),
    useOutlet: () => null,
    useOutletContext: () => ({}),
    useRevalidator: () => ({ revalidate: mocks.revalidate }),
    useMatches: () => mocks.state.matches,
    useSearchParams: () => [new URLSearchParams()],
    useLocation: () => ({ pathname: "/workspaces/ws-1" }),
  };
});

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));

vi.mock("@/components/workspace/WorkspaceNav", () => ({
  default: () => <nav data-testid="workspace-nav">Sidebar</nav>,
}));

vi.mock("@/components/workspace/WorkspaceToday", () => ({
  default: () => <div data-testid="page-content">Today</div>,
}));

const onboardingMatch = {
  loaderData: {
    onboarding: {
      selectedGoal: null,
      currentStep: "business_identity",
      steps: [],
    },
    workspaceId: "ws-1",
    workspaceName: "Workspace One",
    creditsBalance: 0,
  },
};

describe("workspaces+/$id.tsx sidebar onboarding gating", () => {
  beforeEach(() => {
    mocks.state.shouldRedirectToOnboarding = false;
    mocks.state.matches = [];
  });

  test("shows the sidebar when onboarding is complete", () => {
    render(<Workspace />);
    expect(screen.getByTestId("workspace-nav")).toBeInTheDocument();
  });

  test("shows the sidebar while the workspace still needs onboarding", () => {
    mocks.state.shouldRedirectToOnboarding = true;
    render(<Workspace />);
    expect(screen.getByTestId("workspace-nav")).toBeInTheDocument();
  });

  test("hides the sidebar while the onboarding wizard route is active", () => {
    mocks.state.matches = [onboardingMatch];
    render(<Workspace />);
    expect(screen.queryByTestId("workspace-nav")).not.toBeInTheDocument();
  });
});
