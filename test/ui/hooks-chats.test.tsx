import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMockFetcher,
  createWorkspaceRealtimeMock,
  installIntersectionObserverMock,
} from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const messagingMocks = vi.hoisted(() => ({
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  fetchContactsByPhone: vi.fn(),
  fetchLatestMessageForPhone: vi.fn(),
  fetchConversationSummaries: vi.fn(),
  fetchAudienceUploads: vi.fn(),
  fetchCampaignQueueItemWithContact: vi.fn(),
}));

vi.mock("@/lib/chats/messaging-client", () => messagingMocks);

vi.mock("@/hooks/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/utils")>();
  const { useEffect } = await import("react");
  return {
    ...actual,
    useFetcherOnIdle: (
      fetcher: { state: string; data?: unknown },
      onIdle: (data: unknown) => void,
    ) => {
      useEffect(() => {
        if (fetcher.state === "idle") {
          onIdle(fetcher.data);
        }
        // onIdle omitted intentionally: this test double mirrors the real
        // useFetcherOnIdle, which fires on the fetcher busy→idle edge, not on
        // callback identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [fetcher.state, fetcher.data]);
    },
  };
});

const imageFetcher = createMockFetcher({ state: "idle", data: undefined });
const olderFetcher = createMockFetcher({ state: "idle" });

/**
 * Loader data is built ONCE, not per call.
 *
 * `useChatRealTime` (app/hooks/realtime/useChatRealtime.ts) synchronises local
 * state from the loader list with `useEffect(..., [initial])` — an
 * ARRAY-IDENTITY dependency, which is correct because the real
 * `useLoaderData()` returns a stable object for the lifetime of a navigation.
 *
 * Building this object inside the mock instead made every call return a fresh
 * array, so the effect re-fired on every render, `setMessages` produced a new
 * render, the next call produced another new array, and the test spun in an
 * unbounded render loop: measured at 4.20 GB peak RSS and 6m04s, finishing 1
 * of 3 tests before the worker was killed. That is the same failure the `ui`
 * suite shows in CI as `148 passed (149)` / `907 passed (910)`.
 *
 * The fixed timestamp matters for the same reason as the hoisting: a stable
 * array holding a fresh `new Date()` would still be a new object per call.
 */
const LOADER_DATA = {
  messages: [
    {
      sid: "m1",
      body: "hi",
      date_created: "2026-01-01T00:00:00.000Z",
      status: "received",
      direction: "inbound",
      from: "+1",
      to: "+2",
    },
  ],
  hasMore: false,
  contact_number: "+15551234567",
  optOutKeywords: ["stop"],
} as const;

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: ({ key }: { key?: string } = {}) => {
      if (key === "images") return imageFetcher;
      return olderFetcher;
    },
    useLoaderData: () => LOADER_DATA,
    useParams: () => ({ contact_number: encodeURIComponent("+15551234567") }),
    useLocation: () => ({ pathname: "/workspaces/ws/chats/+15551234567" }),
  };
});

describe("chats hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIntersectionObserverMock();
    document.body.innerHTML = '<input id="image" type="file" />';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("useImageHandling uploads and removes images", async () => {
    const { useImageHandling } = await import("@/hooks/chats/useImageHandling");
    const { result, rerender } = renderHook(() => useImageHandling("ws"));

    const file = new File(["x"], "a.png", { type: "image/png" });
    act(() => {
      result.current.handleImageSelect({
        target: { files: [file] },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      imageFetcher.state = "idle";
      imageFetcher.data = { success: true, url: "https://img" };
      rerender();
    });
    expect(result.current.selectedImages).toContain("https://img");

    act(() => result.current.handleImageRemove("https://img"));
    expect(result.current.selectedImages).not.toContain("https://img");
  });

  test("useChatThread registers actions and exposes messages", async () => {
    const { client } = createWorkspaceRealtimeMock();
    const { useChatThread } = await import("@/hooks/chats/useChatThread");
    const registerChatActions = vi.fn();

    const { result } = renderHook(() =>
      useChatThread({
        client: client as never,
        workspace: { id: "ws" } as never,
        registerChatActions,
      }),
    );

    expect(registerChatActions).toHaveBeenCalled();
    expect(result.current.messages.length).toBeGreaterThan(0);
  });

  test("useChatThread starts at and follows the newest message", async () => {
    const { client } = createWorkspaceRealtimeMock();
    const { useChatThread } = await import("@/hooks/chats/useChatThread");
    const registerChatActions = vi.fn();
    const setScrollTop = vi.fn();

    function ThreadScrollProbe() {
      const thread = useChatThread({
        client: client as never,
        workspace: { id: "ws" } as never,
        registerChatActions,
      });

      return (
        <div
          ref={(node) => {
            (thread.scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (!node) return;
            Object.defineProperties(node, {
              scrollHeight: { configurable: true, value: 500 },
              scrollTop: {
                configurable: true,
                get: () => 0,
                set: setScrollTop,
              },
            });
          }}
        >
          <div ref={thread.messagesEndRef} />
        </div>
      );
    }

    render(<ThreadScrollProbe />);

    await waitFor(() => expect(setScrollTop).toHaveBeenLastCalledWith(500));
    setScrollTop.mockClear();

    const actions = registerChatActions.mock.calls.at(-1)?.[0];
    expect(actions?.addOptimisticMessage).toBeDefined();
    act(() => {
      actions?.addOptimisticMessage?.({ body: "Sent", to: "+15551234567" });
    });

    await waitFor(() => expect(setScrollTop).toHaveBeenLastCalledWith(500));
  });
});
