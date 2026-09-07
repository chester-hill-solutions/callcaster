import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";

// The zero-credit banner must not claim a balance was "depleted" or that
// campaigns can "resume" on a workspace that never had anything (#1069).
const state = vi.hoisted(() => ({
  workspaceData: {
    workspace: { id: "ws-1", name: "Workspace One", credits: 0 },
    audiences: [] as Array<{ id: number }>,
    campaigns: [] as Array<{ id: number; title: string }>,
    phoneNumbers: [] as Array<{ id: number }>,
  },
}));

vi.mock("@/routes/workspaces+/$id.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/workspaces+/$id.middleware.server", () => ({ middleware: [] }));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      userRole: "owner",
      workspaceData: state.workspaceData,
      onboardingReadiness: {
        shouldShowOnboardingBanner: false,
        shouldRedirectToOnboarding: false,
        warnings: [],
      },
      today: { kind: "add_credits", href: "/workspaces/ws-1/billing", unreadCount: 0, runningCampaignTitle: null },
    }),
    useOutlet: () => null,
    useOutletContext: () => ({}),
    useRevalidator: () => ({ revalidate: vi.fn() }),
    useMatches: () => [],
    useLocation: () => ({ pathname: "/workspaces/ws-1" }),
  };
});
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));
vi.mock("@/components/workspace/WorkspaceNav", () => ({ default: () => <nav /> }));
vi.mock("@/components/workspace/WorkspaceToday", () => ({ default: () => <div /> }));

describe("workspace zero-credit banner copy (#1069)", () => {
  beforeEach(() => {
    state.workspaceData.audiences = [];
    state.workspaceData.campaigns = [];
    state.workspaceData.phoneNumbers = [];
  });

  test("a workspace with nothing in it is invited to start, not to resume", () => {
    render(<Workspace />);
    expect(screen.getByText("No credits yet. Add credits to start campaigns and calls.")).toBeInTheDocument();
    expect(screen.queryByText(/depleted/)).toBeNull();
  });

  test("a workspace that has campaigns is told its balance is depleted", () => {
    state.workspaceData.campaigns = [{ id: 20, title: "Fall drive" }];
    render(<Workspace />);
    expect(screen.getByText(/Credit balance is depleted/)).toBeInTheDocument();
  });

  test("a workspace with only a number counts as set up", () => {
    state.workspaceData.phoneNumbers = [{ id: 30 }];
    render(<Workspace />);
    expect(screen.getByText(/Credit balance is depleted/)).toBeInTheDocument();
  });
});
