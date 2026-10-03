import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Message, Workspace } from "@/lib/types";
import { createWorkspaceEventSourceMock, installIntersectionObserverMock } from "./hooks-test-helpers";

vi.hoisted(() => { process.env.TZ = "UTC"; });
const router = vi.hoisted(() => ({
  loader: {} as Record<string, unknown>, contact: "+15551234567", workspace: "ws",
  pathname: "/workspaces/ws/chats/+15551234567", search: "", older: {
    state: "idle", data: undefined as unknown, load: vi.fn(),
  },
}));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useLoaderData: () => router.loader,
  useParams: () => ({ contact_number: router.contact }),
  useLocation: () => ({ pathname: router.pathname, search: router.search }),
  useFetcher: () => router.older,
  useOutletContext: () => ({ workspace: { id: router.workspace }, workspaceNumbers: [] }),
}));
vi.mock("@/lib/chats/messaging-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chats/messaging-client")>()),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
}));
// The route-key tests replace only the presentation. Both state hooks remain real.
vi.mock("@/components/chats/ChatThreadView", async () => {
  const { useChatThread } = await import("@/hooks/chats/useChatThread");
  return { ChatThreadView: ({ workspace }: { workspace: NonNullable<Workspace> }) => {
    const thread = useChatThread({ workspace });
    return <output data-testid="thread">{thread.messages.map(m => m?.sid).join(",")}:{String(thread.hasMoreOlder)}</output>;
  } };
});
import { useChatThread } from "@/hooks/chats/useChatThread";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
// Route UI tests supply loader data through the router fixture; do not load the server DB graph.
vi.mock("@/routes/workspaces+/$id/chats/$contact_number.loader.server", () => ({ loader: vi.fn() }));
import ChatScreen from "@/routes/workspaces+/$id/chats/$contact_number.route";

function message(sid: string, minute: number, overrides: Partial<NonNullable<Message>> = {}): NonNullable<Message> {
  return {
    account_sid: null, api_version: null, body: sid, campaign_id: null, contact_id: null,
    date_created: new Date(Date.UTC(2026, 9, 3, 13, minute)), date_sent: null, date_updated: null,
    direction: "outbound-reply", error_code: null, error_message: null,
    from: "+18005550199", to: "+15551234567", inbound_media: [], outbound_media: [],
    messaging_service_sid: null, num_media: "0", num_segments: "1", scheduled_at: null,
    outreach_attempt_id: null, price: null, price_unit: null, sid, status: "sent",
    subresource_uris: null, uri: null, workspace: "ws", ...overrides,
  };
}
function page(messages: Message[], hasMore = true) {
  return { messages, hasMore, contact_number: router.contact, optOutKeywords: ["stop"] };
}
function ids(messages: Message[]) { return messages.map(m => m?.sid); }
const workspace = { id: "ws" } as NonNullable<Workspace>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T13:39:00.250Z"));
  installIntersectionObserverMock();
  router.contact = "+15551234567"; router.workspace = "ws";
  router.pathname = "/workspaces/ws/chats/+15551234567"; router.search = "";
  router.loader = page([message("latest", 30)]);
  router.older.state = "idle"; router.older.data = undefined;
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function loadTwoPages(rerender: () => void) {
  act(() => { router.older.data = page([message("middle", 20)]); rerender(); });
  act(() => { router.older.data = page([message("oldest", 10)], false); rerender(); });
}

describe("retained chat thread history", () => {
  test.each(["reply", "filter"])("%s revalidation keeps two older pages and reconciles the latest row", async (trigger) => {
    createWorkspaceEventSourceMock();
    let actions: Parameters<NonNullable<Parameters<typeof useChatThread>[0]["registerChatActions"]>>[0];
    const registerChatActions = (next: typeof actions) => { actions = next; };
    const { result, rerender } = renderHook(() => useChatThread({ workspace, registerChatActions }));
    loadTwoPages(rerender);
    expect(ids(result.current.messages)).toEqual(["oldest", "middle", "latest"]);
    expect(result.current.hasMoreOlder).toBe(false);
    if (trigger === "reply") act(() => { actions?.addOptimisticMessage?.({ body: "reply", to: router.contact, sid: "pending-reply" }); });
    act(() => {
      if (trigger === "filter") router.search = "?sort=hasUnreadReply&campaignId=42";
      router.loader = page([message("latest", 30, { body: "refreshed", status: "delivered" }), ...(trigger === "reply" ? [message("saved-reply", 40, { body: "reply" })] : [])]);
      rerender();
    });
    expect(ids(result.current.messages)).toEqual(trigger === "reply" ? ["oldest", "middle", "latest", "saved-reply"] : ["oldest", "middle", "latest"]);
    expect(result.current.messages.find(m => m?.sid === "latest")).toMatchObject({ body: "refreshed", status: "delivered" });
    expect(result.current.hasMoreOlder).toBe(false);
  });

  test.each(["known old row", "unseen old row", "unknown saved time"])("%s cannot remove a new repeated reply or hide its failure", (kind) => {
    createWorkspaceEventSourceMock();
    const old = message("old-reply", kind === "known old row" ? 39 : 30, { body: "Thanks" });
    router.loader = page([old]);
    const { result, rerender } = renderHook(() => useChatRealTime({
      initial: router.loader.messages as Message[], workspace: "ws", contact_number: router.contact,
    }));
    act(() => { result.current.addOptimisticMessage({ body: "Thanks", to: router.contact, sid: "pending-repeat" }); });
    const candidate = kind === "known old row" ? old : message("unseen-reply", 35, {
      body: "Thanks", ...(kind === "unknown saved time" ? { date_created: null } : {}),
    });
    act(() => { router.loader = page([old, candidate]); rerender(); });
    expect(result.current.messages.find(m => m?.sid === "pending-repeat")).toMatchObject({ body: "Thanks", status: "sending" });
    act(() => { result.current.markOptimisticMessageFailed("pending-repeat"); });
    expect(result.current.messages.find(m => m?.sid === "pending-repeat")).toMatchObject({ status: "failed" });
  });

  test("a new saved reply with second precision replaces optimistic milliseconds", () => {
    createWorkspaceEventSourceMock();
    const { result, rerender } = renderHook(() => useChatRealTime({
      initial: router.loader.messages as Message[], workspace: "ws", contact_number: router.contact,
    }));
    act(() => { result.current.addOptimisticMessage({ body: "reply", to: router.contact, sid: "pending-reply" }); });
    act(() => { router.loader = page([message("latest", 30), message("saved", 39, { body: "reply" })]); rerender(); });
    expect(ids(result.current.messages)).toEqual(["latest", "saved"]);
  });

  test("SSE and loader overlap retain older/live rows without duplicate SIDs", () => {
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();
    const { result, rerender } = renderHook(() => useChatThread({ workspace }));
    loadTwoPages(rerender);
    const emit = (row: NonNullable<Message>) => emitWorkspaceEvent({ eventType: "INSERT", table: "message", new: row, old: null });
    act(() => { emit(message("oldest", 10)); emit(message("live", 35)); emit(message("unmatched-live", 36)); });
    act(() => { router.loader = page([message("latest", 30), message("live", 35, { status: "delivered" })]); rerender(); });
    act(() => { emit(message("live", 35)); emit(message("oldest", 10)); emit(message("future", 40)); });
    expect(ids(result.current.messages)).toEqual(["oldest", "middle", "latest", "live", "unmatched-live", "future"]);
    expect(result.current.messages.find(m => m?.sid === "live")?.status).toBe("delivered");
  });

  test("an empty older page exhausts pagination across latest-page availability changes", () => {
    createWorkspaceEventSourceMock();
    const { result, rerender } = renderHook(() => useChatThread({ workspace }));
    act(() => { router.older.data = page([], false); rerender(); });
    expect(result.current.hasMoreOlder).toBe(false);
    act(() => { router.loader = page([message("latest", 30)], false); rerender(); });
    act(() => { router.loader = page([message("latest", 30), message("new", 40)], true); rerender(); });
    expect(result.current.hasMoreOlder).toBe(false);
    expect(ids(result.current.messages)).toEqual(["latest", "new"]);
  });

  test("equivalent contact formatting retains the same conversation history", () => {
    createWorkspaceEventSourceMock();
    const initial = [message("seed", 30)];
    const { result, rerender } = renderHook(() => useChatRealTime({ initial, workspace: router.workspace, contact_number: router.contact }));
    act(() => { result.current.setMessages(prev => [message("loaded-old", 10), ...prev]); });
    act(() => { router.contact = "(555) 123-4567"; rerender(); });
    expect(ids(result.current.messages)).toEqual(["loaded-old", "seed"]);
  });

  test("current thread ignores events for another contact or workspace", () => {
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();
    const { result } = renderHook(() => useChatThread({ workspace }));
    act(() => {
      emitWorkspaceEvent({ eventType: "INSERT", table: "message", new: message("foreign-contact", 40, { to: "+15557654321" }), old: null });
      emitWorkspaceEvent({ eventType: "INSERT", table: "message", new: message("foreign-workspace", 40, { workspace: "other" }), old: null });
      emitWorkspaceEvent({ eventType: "INSERT", table: "message", new: message("current", 40), old: null });
    });
    expect(ids(result.current.messages)).toEqual(["latest", "current"]);
  });

  test.each(["contact", "workspace"])("the real route resets history and pagination on %s change", (field) => {
    createWorkspaceEventSourceMock();
    const { rerender } = render(<ChatScreen />);
    loadTwoPages(() => rerender(<ChatScreen />));
    expect(screen.getByTestId("thread")).toHaveTextContent("oldest,middle,latest:false");
    act(() => {
      if (field === "contact") router.contact = "+15557654321";
      else router.workspace = "other";
      router.loader = page([message("new-thread", 5, { workspace: router.workspace, to: router.contact })]);
      router.older.data = undefined;
      rerender(<ChatScreen />);
    });
    expect(screen.getByTestId("thread")).toHaveTextContent("new-thread:true");
  });

  test.each(["contact", "workspace"])("realtime hook resets on %s identity even with the same initial array", (field) => {
    createWorkspaceEventSourceMock();
    const initial = [message("seed", 30)];
    const { result, rerender } = renderHook(() => useChatRealTime({ initial, workspace: router.workspace, contact_number: router.contact }));
    act(() => { result.current.setMessages(prev => [message("loaded-old", 10), ...prev]); });
    expect(ids(result.current.messages)).toEqual(["loaded-old", "seed"]);
    act(() => {
      if (field === "contact") router.contact = "+15557654321";
      else router.workspace = "other";
      rerender();
    });
    expect(ids(result.current.messages)).toEqual(["seed"]);
  });
});
