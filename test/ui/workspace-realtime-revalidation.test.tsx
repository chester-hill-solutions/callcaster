import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";

const mocks = vi.hoisted(() => ({
  revalidate: vi.fn(),
  subscriptionOptions: null as null | {
    workspaceId: string;
    table?: string | string[];
    onChange: () => void;
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
        workspace: { id: "ws-1", name: "Workspace One", credits: 42 },
        audiences: [{ id: 10 }],
        campaigns: [{ id: 20, title: "Loader campaign" }],
        phoneNumbers: [{ id: 30 }],
      },
      onboardingReadiness: {
        shouldShowOnboardingBanner: false,
        shouldRedirectToOnboarding: false,
        warnings: [],
      },
      today: {
        kind: "review_campaigns",
        href: "/workspaces/ws-1/campaigns",
        unreadCount: 0,
        runningCampaignTitle: null,
      },
    }),
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
  useWorkspaceEventSubscription: (options: typeof mocks.subscriptionOptions) => {
    mocks.subscriptionOptions = options;
  },
}));

vi.mock("@/components/workspace/WorkspaceNav", () => ({
  default: ({
    workspace,
    campaigns,
  }: {
    workspace: { name: string };
    campaigns: Array<{ title: string }>;
  }) => (
    <div>
      {workspace.name}:{campaigns[0]?.title}
    </div>
  ),
}));

vi.mock("@/components/workspace/WorkspaceToday", () => ({
  default: () => <div>Workspace Today</div>,
}));

describe("workspace campaign and credit realtime revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscriptionOptions = null;
  });

  test("subscribes to campaign and transaction_history and revalidates once per matching event", () => {
    render(<Workspace />);

    expect(
      screen.getByText("Workspace One:Loader campaign"),
    ).toBeInTheDocument();
    expect(mocks.subscriptionOptions).toMatchObject({
      workspaceId: "ws-1",
      table: ["campaign", "transaction_history"],
    });

    act(() => mocks.subscriptionOptions?.onChange());

    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
  });
});
