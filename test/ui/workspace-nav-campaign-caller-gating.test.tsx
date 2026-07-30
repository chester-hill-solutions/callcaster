import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/lib/member-role";

// WorkspaceNav pulls in the unread-chats hook, which hits the messaging
// client and a realtime subscription — neither is relevant here, so stub
// them out the same way test/ui/components-workspace-nav.test.tsx does.
const mocks = vi.hoisted(() => ({
  fetchConversationSummaries: vi.fn(),
}));

vi.mock("@/lib/chats/messaging-client", () => ({
  fetchConversationSummaries: (...args: unknown[]) =>
    mocks.fetchConversationSummaries(...args),
}));

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));

vi.mock("@/lib/logger.client", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const CAMPAIGNS = [
  { id: 7, title: "Summer outreach", status: "in_progress" },
];

function renderNav(
  userRole: MemberRole,
  initialEntry = "/workspaces/ws-1/campaigns",
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkspaceNav
        workspace={{ id: "ws-1", name: "Test Workspace", credits: 42 }}
        campaigns={CAMPAIGNS}
        userRole={userRole}
      />
    </MemoryRouter>,
  );
}

// The create action requires Admin+, so navigation visibility mirrors that
// minimum role while preserving read-only campaign links for every role.
describe("WorkspaceNav gates campaign creation by minimum role", () => {
  beforeEach(() => {
    mocks.fetchConversationSummaries.mockResolvedValue([]);
  });

  test("caller does not see the New Campaign link", () => {
    renderNav(MemberRole.Caller);

    expect(screen.queryByRole("link", { name: /new campaign/i })).toBeNull();
  });

  test("caller still sees the Archived Campaigns link (read-only)", () => {
    renderNav(MemberRole.Caller);

    expect(
      screen.getByRole("link", { name: /archived campaigns/i }),
    ).toBeInTheDocument();
  });

  test.each([
    "Today",
    "Campaigns",
    "Messages",
    "Call History",
    "Voicemails",
    "Analytics",
    "Handset",
    "Settings",
  ])(
    "agent still sees the %s link",
    (name) => {
      renderNav(MemberRole.Caller);

      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    },
  );

  test("coordinator does not see the New Campaign link", () => {
    renderNav(MemberRole.Member);

    expect(screen.queryByRole("link", { name: /new campaign/i })).toBeNull();
  });

  test.each([MemberRole.Admin, MemberRole.Owner])(
    "%s sees the New Campaign link",
    (role) => {
      renderNav(role);

      expect(
        screen.getByRole("link", { name: /new campaign/i }),
      ).toBeInTheDocument();
    },
  );
});

describe("WorkspaceNav task groups and destinations", () => {
  beforeEach(() => {
    mocks.fetchConversationSummaries.mockResolvedValue([]);
  });

  test("renders non-link task group labels in the expected order", () => {
    renderNav(MemberRole.Member);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) =>
        heading.textContent?.trim(),
      ),
    ).toEqual(["Work", "Prepare", "Review", "Setup"]);
    for (const groupName of ["Work", "Prepare", "Review", "Setup"]) {
      expect(
        screen.queryByRole("link", { name: groupName }),
      ).not.toBeInTheDocument();
    }
  });

  test("keeps customer-facing labels on the existing URLs", () => {
    renderNav(MemberRole.Member);

    const expectedLinks: Array<[string, string]> = [
      ["Today", "/workspaces/ws-1"],
      ["Campaigns", "/workspaces/ws-1/campaigns"],
      ["Messages", "/workspaces/ws-1/chats"],
      ["Call History", "/workspaces/ws-1/calls"],
      ["Voicemails", "/workspaces/ws-1/voicemails"],
      ["Handset", "/workspaces/ws-1/handset"],
      ["Scripts", "/workspaces/ws-1/scripts"],
      ["Surveys", "/workspaces/ws-1/surveys"],
      ["Audio", "/workspaces/ws-1/audios"],
      ["Call lists", "/workspaces/ws-1/audiences"],
      ["Contacts", "/workspaces/ws-1/contacts"],
      ["Analytics", "/workspaces/ws-1/analytics"],
      ["Exports", "/workspaces/ws-1/exports"],
      ["Settings", "/workspaces/ws-1/settings"],
    ];

    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  test("hides coordinator-only groups and links from agents", () => {
    renderNav(MemberRole.Caller);

    expect(screen.queryByRole("region", { name: "Prepare" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Scripts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Call lists" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Exports" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Credits" })).toBeNull();
  });

  test("shows coordinator links at the typed minimum role", () => {
    renderNav(MemberRole.Member);

    expect(screen.getByRole("region", { name: "Prepare" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scripts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call lists" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exports" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Credits" })).toBeNull();
  });

  test.each([MemberRole.Admin, MemberRole.Owner])(
    "shows the Credits utility to %s",
    (role) => {
      renderNav(role);

      expect(screen.getByRole("link", { name: /credits/i })).toHaveAttribute(
        "href",
        "/workspaces/ws-1/billing",
      );
    },
  );

  test("marks Today active only at the exact workspace root", () => {
    renderNav(MemberRole.Member, "/workspaces/ws-1");

    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Campaigns" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.queryByRole("link", { name: /summer outreach/i }),
    ).toBeNull();
  });

  test("marks Campaigns active on campaign routes while Today stays inactive", () => {
    renderNav(MemberRole.Member, "/workspaces/ws-1/campaigns/7");

    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("preserves dynamic campaign links and status labels", () => {
    renderNav(MemberRole.Member);

    expect(
      screen.getByRole("link", { name: /summer outreach/i }),
    ).toHaveAttribute("href", "/workspaces/ws-1/campaigns/7");
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  test("renders the same authorized links in desktop and mobile navigation", async () => {
    const user = userEvent.setup();
    const { container } = renderNav(MemberRole.Admin);
    const desktopNav = container.querySelector("aside");

    expect(desktopNav).not.toBeNull();
    const desktopHrefs = within(desktopNav as HTMLElement)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    await user.click(screen.getByRole("button", { name: "Browse Workspace" }));

    const mobileHrefs = within(screen.getByRole("dialog"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(mobileHrefs).toEqual(desktopHrefs);
  });
});
