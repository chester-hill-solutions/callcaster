import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";

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

function renderNav(userRole: MemberRole) {
  return render(
    <MemoryRouter initialEntries={["/workspaces/ws-1/campaigns"]}>
      <WorkspaceNav
        workspace={{ id: "ws-1", name: "Test Workspace", credits: 42 }}
        campaigns={[]}
        userRole={userRole}
      />
    </MemoryRouter>,
  );
}

// The "New Campaign" nav entry led straight to a fully-enabled create form
// that always 403s server-side for callers (new.action.server.ts requires
// Admin+). Every other write-only nav destination (Scripts, Audiences,
// Exports, ...) is already hidden for callers via `callerHidden`; this
// closes the gap for the campaign creation entry point using the same flag.
describe("WorkspaceNav hides the create-campaign entry point from callers", () => {
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

  test.each([MemberRole.Member, MemberRole.Admin, MemberRole.Owner])(
    "%s sees the New Campaign link",
    (role) => {
      renderNav(role);

      expect(
        screen.getByRole("link", { name: /new campaign/i }),
      ).toBeInTheDocument();
    },
  );
});
