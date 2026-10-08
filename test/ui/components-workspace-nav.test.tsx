import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  realtimeOpts: null as any,
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: (opts: unknown) => {
    mocks.realtimeOpts = opts;
    return undefined;
  },
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

function replyWithCount(unread_count: number) {
  mocks.fetch.mockImplementation(() => Promise.resolve(Response.json({ unread_count })));
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
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.logger.error.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("renders nothing when unread total is 0", async () => {
    replyWithCount(0);

    renderNav();

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalled(),
    );
    expect(screen.queryAllByTestId("chats-unread-badge")).toHaveLength(0);
  });

  test("renders the workspace unread total returned by the count API", async () => {
    replyWithCount(7);

    renderNav();

    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge").length).toBeGreaterThan(0),
    );
    for (const badge of screen.getAllByTestId("chats-unread-badge")) {
      expect(badge.textContent).toBe("7");
    }

    expect(mocks.fetch).toHaveBeenCalledWith("/api/workspaces/ws-1/conversations?summary=unread");
  });

  test("caps the displayed count at 99+", async () => {
    replyWithCount(150);

    renderNav();

    await waitFor(() =>
      expect(screen.getAllByTestId("chats-unread-badge").length).toBeGreaterThan(0),
    );
    for (const badge of screen.getAllByTestId("chats-unread-badge")) {
      expect(badge.textContent).toBe("99+");
    }
  });

  test("increments on realtime inbound message INSERT, ignores outbound and non-INSERT events", async () => {
    replyWithCount(1);

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
    mocks.fetch.mockRejectedValue(new Error("network down"));

    renderNav();

    await waitFor(() => expect(mocks.logger.error).toHaveBeenCalled());
    expect(screen.queryAllByTestId("chats-unread-badge")).toHaveLength(0);
  });
});
