import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";

const mocks = vi.hoisted(() => ({
  fetchConversationSummaries: vi.fn(),
  realtimeOpts: null as any,
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/chats/messaging-client", () => ({
  fetchConversationSummaries: (...args: unknown[]) =>
    mocks.fetchConversationSummaries(...args),
}));

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: (opts: unknown) => {
    mocks.realtimeOpts = opts;
    return undefined;
  },
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    contact_phone: "+15550001111",
    user_phone: "+15559998888",
    conversation_start: new Date().toISOString(),
    conversation_last_update: new Date().toISOString(),
    message_count: 1,
    unread_count: 0,
    contact_firstname: null,
    contact_surname: null,
    ...overrides,
  };
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/workspaces/ws-1/chats"]}>
      <WorkspaceNav
        workspace={{ id: "ws-1", name: "Test Workspace", credits: 42 }}
        campaigns={[]}
        userRole={MemberRole.Member}
      />
    </MemoryRouter>,
  );
}

describe("app/components/workspace/WorkspaceNav.tsx unread chats badge", () => {
  beforeEach(() => {
    mocks.realtimeOpts = null;
    mocks.fetchConversationSummaries.mockReset();
    mocks.logger.error.mockReset();
  });

  test("renders nothing when unread total is 0", async () => {
    mocks.fetchConversationSummaries.mockResolvedValue([
      makeSummary({ unread_count: 0 }),
      makeSummary({ unread_count: 0 }),
    ]);

    renderNav();

    await waitFor(() =>
      expect(mocks.fetchConversationSummaries).toHaveBeenCalled(),
    );
    expect(screen.queryAllByTestId("chats-unread-badge")).toHaveLength(0);
  });

  test("renders the summed unread_count across conversations", async () => {
    mocks.fetchConversationSummaries.mockResolvedValue([
      makeSummary({ unread_count: 3 }),
      makeSummary({ unread_count: 4, contact_phone: "+15550002222" }),
    ]);

    renderNav();

    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge").length).toBeGreaterThan(0),
    );
    for (const badge of screen.getAllByTestId("chats-unread-badge")) {
      expect(badge.textContent).toBe("7");
    }

    // Fetches the largest page the endpoint allows so the client-side sum
    // covers as many conversations as possible in a single request.
    const [, params] = mocks.fetchConversationSummaries.mock.calls[0];
    expect((params as URLSearchParams).get("page_size")).toBe("100");
  });

  test("caps the displayed count at 99+", async () => {
    mocks.fetchConversationSummaries.mockResolvedValue([
      makeSummary({ unread_count: 150 }),
    ]);

    renderNav();

    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge").length).toBeGreaterThan(0),
    );
    for (const badge of screen.getAllByTestId("chats-unread-badge")) {
      expect(badge.textContent).toBe("99+");
    }
  });

  test("increments on realtime inbound message INSERT, ignores outbound and non-INSERT events", async () => {
    mocks.fetchConversationSummaries.mockResolvedValue([
      makeSummary({ unread_count: 1 }),
    ]);

    renderNav();

    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge")[0]?.textContent).toBe("1"),
    );

    act(() => {
      mocks.realtimeOpts.onChange({
        eventType: "INSERT",
        new: { direction: "inbound", workspace: "ws-1" },
      });
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge")[0]?.textContent).toBe("2"),
    );

    act(() => {
      mocks.realtimeOpts.onChange({
        eventType: "INSERT",
        new: { direction: "outbound", workspace: "ws-1" },
      });
    });
    expect(screen.getAllByTestId("chats-unread-badge")[0]?.textContent).toBe("2");

    act(() => {
      mocks.realtimeOpts.onChange({
        eventType: "UPDATE",
        new: { direction: "inbound", workspace: "ws-1" },
      });
    });
    expect(screen.getAllByTestId("chats-unread-badge")[0]?.textContent).toBe("2");

    expect(mocks.realtimeOpts.table).toBe("message");
  });

  test("logs and leaves count at 0 when the fetch fails", async () => {
    mocks.fetchConversationSummaries.mockRejectedValue(new Error("network down"));

    renderNav();

    await waitFor(() => expect(mocks.logger.error).toHaveBeenCalled());
    expect(screen.queryAllByTestId("chats-unread-badge")).toHaveLength(0);
  });
});
