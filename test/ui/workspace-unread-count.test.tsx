import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const events = vi.hoisted(() => ({ subscriptions: [] as Array<{ workspaceId: string; onChange: (payload: unknown) => void }> }));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/realtime/useWorkspaceEventSubscription")>()),
  useWorkspaceEventSubscription: (options: { workspaceId: string; onChange: (payload: unknown) => void }) => { events.subscriptions.push(options); },
}));
import { useUnreadConversationsCount } from "@/hooks/chats/useUnreadConversationsCount";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const replies = new Map<string, () => Promise<Response>>();
const fetchMock = vi.fn();
function payload(value: unknown, status = 200) {
  return () => Promise.resolve(Response.json(value, { status }));
}
async function settle() { await act(async () => {}); }
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); }
function inbound(subscription = events.subscriptions.at(-1)!) {
  act(() => subscription.onChange({ eventType: "INSERT", new: { sid: "new-inbound", direction: "inbound", workspace: subscription.workspaceId } }));
}
beforeEach(() => {
  vi.useFakeTimers();
  events.subscriptions = [];
  replies.clear();
  replies.set(workspaceId, payload({ unread_count: 107 }));
  replies.set(otherWorkspaceId, payload({ unread_count: 20 }));
  fetchMock.mockReset().mockImplementation((input: string) => {
    const url = new URL(input, "http://localhost");
    // Contract control: an ordinary list returns only its newest 100 rows.
    // The real client must ask for the documented count mode.
    if (url.searchParams.get("summary") !== "unread") {
      return Promise.resolve(Response.json({ conversations: Array.from({ length: 100 }, () => ({ unread_count: 1 })) }));
    }
    return replies.get(url.pathname.split("/")[3])!();
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("the full total and an inbound reply outside page 100 survive repeated polls", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  expect(result.current).toBe(107);
  replies.set(workspaceId, payload({ unread_count: 108 }));
  inbound();
  expect(result.current).toBe(108);
  await poll();
  expect(result.current).toBe(108);
  await poll();
  expect(result.current).toBe(108);
});
test("failed and malformed count responses retain the last known total", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  expect(result.current).toBe(107);
  replies.set(workspaceId, payload({ error: "Failed to load unread count" }, 500));
  await poll();
  expect(result.current).toBe(107);
  for (const invalid of [{ unread_count: -1 }, { unread_count: 1.5 }, { unread_count: "108" }, {}]) {
    replies.set(workspaceId, payload(invalid));
    await poll();
    expect(result.current).toBe(107);
  }
});
test("switching workspaces clears the old visible count and does not wait for its poll", async () => {
  const { result, rerender } = renderHook(({ id }) => useUnreadConversationsCount(id), { initialProps: { id: workspaceId } });
  await settle();
  expect(result.current).toBe(107);
  const oldSubscription = events.subscriptions.at(-1)!;
  let finishOld!: (response: Response) => void;
  replies.set(workspaceId, () => new Promise(resolve => { finishOld = resolve; }));
  await poll();
  rerender({ id: otherWorkspaceId });
  expect(result.current).toBe(0);
  await settle();
  expect(result.current).toBe(20);
  await act(async () => { finishOld(Response.json({ unread_count: 999 })); });
  expect(result.current).toBe(20);
  inbound(oldSubscription);
  expect(result.current).toBe(20);
});
test("outbound and non-insert events do not create unread messages", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  act(() => {
    const subscription = events.subscriptions.at(-1)!;
    subscription.onChange({ eventType: "INSERT", new: { direction: "outbound-api" } });
    subscription.onChange({ eventType: "UPDATE", new: { direction: "inbound" } });
  });
  expect(result.current).toBe(107);
});
