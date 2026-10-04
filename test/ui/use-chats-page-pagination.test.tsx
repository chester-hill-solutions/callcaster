import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2157: the loader-to-state sync in useChatsPage compared *page numbers* to
 * decide whether a loader response had already been folded in. After the agent
 * paginates, a fresh page-1 response is discarded forever, because
 * `fetchedPage` stays ahead of `pagination.page` for the life of the page.
 */

const routerMocks = vi.hoisted(() => ({
  loaderData: {} as Record<string, unknown>,
  searchParams: new URLSearchParams(),
  /** One data slot per fetcher key, as React Router actually keeps them. */
  fetcherData: new Map<string, unknown>(),
  load: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useLoaderData: () => routerMocks.loaderData,
  useSearchParams: () => [
    routerMocks.searchParams,
    vi.fn(),
  ] as const,
  // React Router scopes a fetcher by key, and this hook holds two: one for the
  // message send, one keyed on workspace + filters for pagination. A new key
  // starts empty, which is what makes a filter change reset the accumulation.
  useFetcher: (options?: { key?: string }) => ({
    state: "idle" as const,
    data: routerMocks.fetcherData.get(options?.key ?? ""),
    load: routerMocks.load,
  }),
  useOutletContext: () => ({
    workspace: { id: "ws-1", name: "WS" },
  }),
  useOutlet: () => ({}),
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/chats/messaging-client", () => ({
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  fetchConversationSummaries: vi.fn(),
  fetchCampaignQueueItemWithContact: vi.fn(),
}));
vi.mock("@/hooks/contact/useContactSearch", () => ({
  useContactSearch: () => ({
    selectedContact: null,
    isContactMenuOpen: false,
    searchError: null,
    contacts: [],
    phoneNumber: "",
    existingConversation: null,
    handleSearch: vi.fn(),
    toggleContactMenu: vi.fn(),
    isValid: true,
  }),
}));
vi.mock("@/hooks/chats/useImageHandling", () => ({
  useImageHandling: () => ({
    selectedImages: [],
    setSelectedImages: vi.fn(),
    handleImageSelect: vi.fn(),
    handleImageRemove: vi.fn(),
  }),
}));
vi.mock("@/hooks/realtime/useWorkspaceRealtime", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));

import { useChatsPage } from "@/hooks/chats/useChatsPage";

type Summary = {
  contact_phone: string;
  unread_count: number;
  conversation_last_update: string;
};

function summary(phone: string, unread: number, updated: string): Summary {
  return {
    contact_phone: phone,
    unread_count: unread,
    conversation_last_update: updated,
  } as unknown as ConversationSummary;
}

function loaderResponse(chats: Summary[], page: number, hasMore = false) {
  return {
    chats,
    chatsError: null,
    pagination: { page, pageSize: 25, hasMore, total: 100 },
    potentialContacts: [],
    contact: null,
    campaigns: [],
    workspaceNumbers: [],
    optOutKeywords: [],
    senderSelection: { messagingServiceReady: false },
  };
}

type Rendered = ReturnType<typeof rendered>;

function rendered() {
  return renderHook(() => useChatsPage());
}

/**
 * Changing a module-level mock does not re-render the hook on its own, so
 * every mock swap has to be paired with an explicit `rerender()`.
 */
function swap(renderedHook: Rendered, apply: () => void) {
  act(() => {
    apply();
    renderedHook.rerender();
  });
}

/** The pagination fetcher's key is derived from the filters, so match the prefix. */
const PAGINATION_KEY_PREFIX = "chat-pages-";

function setFetcher(
  renderedHook: Rendered,
  data: ReturnType<typeof loaderResponse> | undefined,
) {
  swap(renderedHook, () => {
    for (const key of routerMocks.fetcherData.keys()) {
      if (key.startsWith(PAGINATION_KEY_PREFIX)) {
        routerMocks.fetcherData.delete(key);
      }
    }
    if (data) {
      routerMocks.fetcherData.set(
        `${PAGINATION_KEY_PREFIX}ws-1-all:recent:`,
        data,
      );
    }
  });
}

function setLoader(
  renderedHook: Rendered,
  data: ReturnType<typeof loaderResponse>,
) {
  swap(renderedHook, () => {
    routerMocks.loaderData = data;
  });
}

describe("useChatsPage — accumulated pages survive a loader revalidation (#2157)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.searchParams = new URLSearchParams();
    routerMocks.fetcherData.clear();
    routerMocks.loaderData = loaderResponse(
      [summary("+15551110001", 1, "2026-09-01T00:00:00Z")],
      1,
      true,
    );
  });

  test("keeps all 105 conversations through repeated page-1 revalidation", () => {
    const rows = Array.from({ length: 105 }, (_, i) => summary(
      `+1555${String(i).padStart(7, "0")}`, 1, "2026-09-01T00:00:00Z",
    ));
    routerMocks.loaderData = loaderResponse(rows.slice(0, 25), 1, true);
    const hook = rendered();
    setFetcher(hook, loaderResponse(rows.slice(25), 5, false));
    for (const count of [7, 8]) {
      setLoader(hook, loaderResponse([
        { ...rows[0], unread_count: count }, ...rows.slice(1, 25),
      ], 1, true));
      expect(hook.result.current.sidebarProps.chats).toHaveLength(105);
      expect(hook.result.current.sidebarProps.chats.find(row => row.contact_phone === rows[0].contact_phone)?.unread_count).toBe(count);
      expect(hook.result.current.sidebarProps.chats).toContainEqual(rows[104]);
      expect(hook.result.current.sidebarProps.paginationState.page).toBe(5);
    }
  });

  test("applies a fresh page-1 response after pages 2-4 were loaded", () => {
    const hook = rendered();
    const { result } = hook;

    // Pages 1-4 accumulated, as after three "load more" scrolls.
    setFetcher(
      hook,
      loaderResponse(
        [
          summary("+15551110002", 2, "2026-09-02T00:00:00Z"),
          summary("+15551110003", 3, "2026-09-03T00:00:00Z"),
          summary("+15551110004", 4, "2026-09-04T00:00:00Z"),
        ],
        4,
        false,
      ),
    );

    expect(result.current.sidebarProps.chats).toHaveLength(4);
    expect(result.current.sidebarProps.paginationState.page).toBe(4);

    // A realtime event on the page-1 conversation revalidates the loader,
    // returning a NEW page-1 array with a fresh count.
    setLoader(
      hook,
      loaderResponse([summary("+15551110001", 9, "2026-09-05T00:00:00Z")], 1, true),
    );

    const chats = result.current.sidebarProps.chats;
    const first = chats.find((c) => c.contact_phone === "+15551110001");

    // The fresh count must land...
    expect(first?.unread_count).toBe(9);
    // ...and the loaded pages must not be lost.
    expect(chats).toHaveLength(4);
    expect(chats.map((c) => c.contact_phone).sort()).toEqual([
      "+15551110001",
      "+15551110002",
      "+15551110003",
      "+15551110004",
    ]);
  });

  test("keeps a fresh page-1 response applied on every later revalidation", () => {
    const hook = rendered();
    const { result } = hook;

    setFetcher(
      hook,
      loaderResponse([summary("+15551110002", 2, "2026-09-02T00:00:00Z")], 2, false),
    );
    expect(result.current.sidebarProps.chats).toHaveLength(2);

    // Revalidate twice. The old page-number guard dropped this every time.
    for (const count of [7, 8]) {
      setLoader(
        hook,
        loaderResponse([summary("+15551110001", count, "2026-09-05T00:00:00Z")], 1, true),
      );
      const first = result.current.sidebarProps.chats.find(
        (c) => c.contact_phone === "+15551110001",
      );
      expect(first?.unread_count).toBe(count);
      expect(result.current.sidebarProps.chats).toHaveLength(2);
    }
  });

  test("does not rewind the cursor, so load-more does not re-request a held page", () => {
    const hook = rendered();
    const { result } = hook;

    setFetcher(
      hook,
      loaderResponse([summary("+15551110002", 2, "2026-09-02T00:00:00Z")], 2, true),
    );
    expect(result.current.sidebarProps.paginationState.page).toBe(2);

    setLoader(
      hook,
      loaderResponse([summary("+15551110001", 5, "2026-09-05T00:00:00Z")], 1, true),
    );

    // A page-1 revalidation must not reset the cursor to 1, or the next
    // "load more" would re-request page 2, which is already held.
    expect(result.current.sidebarProps.paginationState.page).toBe(2);
  });

  test("still replaces the list when the filter changes", () => {
    const hook = rendered();
    const { result } = hook;

    setFetcher(
      hook,
      loaderResponse([summary("+15551110002", 2, "2026-09-02T00:00:00Z")], 2, false),
    );
    expect(result.current.sidebarProps.chats).toHaveLength(2);

    // The agent narrows to a campaign. The accumulated pages belong to the old
    // filter and must be discarded, not merged into the new result.
    act(() => {
      routerMocks.searchParams = new URLSearchParams("campaign_id=99");
    });
    setLoader(
      hook,
      loaderResponse([summary("+15551110009", 1, "2026-09-06T00:00:00Z")], 1, false),
    );

    const phones = result.current.sidebarProps.chats.map((c) => c.contact_phone);
    expect(phones).toEqual(["+15551110009"]);
  });
});
