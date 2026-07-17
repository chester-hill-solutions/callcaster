import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import WorkspaceToday from "@/components/workspace/WorkspaceToday";
import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";

function renderToday(overrides: Partial<WorkspaceTodaySelection> = {}) {
  const today: WorkspaceTodaySelection = {
    kind: "read_messages",
    href: "/workspaces/ws-1/chats",
    unreadCount: 3,
    runningCampaignTitle: null,
    ...overrides,
  };
  render(
    <MemoryRouter>
      <WorkspaceToday today={today} />
    </MemoryRouter>,
  );
}

describe("WorkspaceToday", () => {
  test("renders one primary action with passive context", () => {
    renderToday();

    expect(
      screen.getByRole("heading", { name: "Reply to new messages" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 messages are ready for your replies."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute(
      "href",
      "/workspaces/ws-1/chats",
    );
  });

  test("names the selected running campaign", () => {
    renderToday({
      kind: "open_running_campaign",
      href: "/workspaces/ws-1/campaigns/2/call",
      runningCampaignTitle: "Morning outreach",
    });

    expect(
      screen.getByRole("heading", { name: "Morning outreach" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open dial session" }),
    ).toHaveAttribute("href", "/workspaces/ws-1/campaigns/2/call");
  });
});
