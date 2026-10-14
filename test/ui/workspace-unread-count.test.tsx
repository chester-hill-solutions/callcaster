import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const events = vi.hoisted(() => ({ subscriptions: [] as Array<{ workspaceId: string; onChange: (payload: unknown) => void }> }));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/realtime/useWorkspaceEventSubscription")>()),
  useWorkspaceEventSubscription: (options: { workspaceId: string; onChange: (payload: unknown) => void }) => { events.subscriptions.push(options); },
}));
import { useUnreadConversationsCount } from "@/hooks/chats/useUnreadConversationsCount";
import { markConversationRead } from "@/lib/chats/messaging-client";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const replies = new Map<string, () => Promise<Response>>();
const fetchMock = vi.fn();
let readReply: () => Promise<Response>;
function payload(value: unknown, status = 200) {
  return () => Promise.resolve(Response.json(value, { status }));
}
async function settle() { await act(async () => {}); }
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); }
function latestSubscription() {
  const subscription = events.subscriptions.at(-1);
  if (!subscription) throw new Error("Expected a workspace subscription");
  return subscription;
}
function inbound(subscription = latestSubscription()) {
  act(() => subscription.onChange({ eventType: "INSERT", new: { sid: "new-inbound", direction: "inbound", workspace: subscription.workspaceId } }));
}
beforeEach(() => {
  vi.useFakeTimers();
  events.subscriptions = [];
  replies.clear();
  replies.set(workspaceId, payload({ unread_count: 107 }));
  replies.set(otherWorkspaceId, payload({ unread_count: 20 }));
  readReply = payload({ ok: true });
  fetchMock.mockReset().mockImplementation((input: string, options?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    if (options?.method === "POST") return readReply();
    // Contract control: an ordinary list returns only its newest 100 rows.
    // The real client must ask for the documented count mode.
    if (url.searchParams.get("summary") !== "unread") {
      return Promise.resolve(Response.json({ conversations: Array.from({ length: 100 }, () => ({ unread_count: 1 })) }));
    }
    const reply = replies.get(url.pathname.split("/")[3]);
    if (!reply) throw new Error("Unexpected workspace request");
    return reply();
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
  const oldSubscription = latestSubscription();
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
    const subscription = latestSubscription();
    subscription.onChange({ eventType: "INSERT", new: { direction: "outbound-api" } });
    subscription.onChange({ eventType: "UPDATE", new: { direction: "inbound" } });
  });
  expect(result.current).toBe(107);
});

test.each([undefined, "inbound-message"])(
  "a successful local read (%s) updates the badge before the next poll",
  async (messageSid) => {
    const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
    await settle();
    expect(result.current).toBe(107);
    replies.set(workspaceId, payload({ unread_count: messageSid ? 106 : 104 }));

    await act(async () => {
      await markConversationRead(workspaceId, "+15555550100", { messageSid });
    });

    expect(result.current).toBe(messageSid ? 106 : 104);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  },
);

test("repeated reads use the saved total instead of subtracting twice", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  replies.set(workspaceId, payload({ unread_count: 104 }));
  for (let repeat = 0; repeat < 3; repeat++) {
    await act(async () => {
      await markConversationRead(workspaceId, "+15555550100");
    });
    expect(result.current).toBe(104);
  }
});

test("a pending or failed read cannot clear the badge", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  let finishRead!: (response: Response) => void;
  readReply = () => new Promise((resolve) => { finishRead = resolve; });
  const read = markConversationRead(workspaceId, "+15555550100");
  const rejected = expect(read).rejects.toThrow("Read failed");
  await settle();
  expect(result.current).toBe(107);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => {
    finishRead(Response.json({ error: "Read failed" }, { status: 500 }));
    await rejected;
  });
  expect(result.current).toBe(107);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each([200, 500])(
  "reads during a pending count (%s) coalesce into one fresh request",
  async (status) => {
    const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
    await settle();
    let finishPoll!: (response: Response) => void;
    replies.set(workspaceId, () => new Promise((resolve) => { finishPoll = resolve; }));
    await poll();
    replies.set(workspaceId, payload({ unread_count: 101 }));
    await act(async () => {
      await Promise.all([
        markConversationRead(workspaceId, "+15555550100"),
        markConversationRead(workspaceId, "+15555550200"),
        markConversationRead(workspaceId, "+15555550300", { messageSid: "read-sid" }),
      ]);
    });
    expect(result.current).toBe(107);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await act(async () => {
      finishPoll(Response.json(status === 200 ? { unread_count: 107 } : { error: "Count failed" }, { status }));
    });
    expect(result.current).toBe(101);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  },
);

test("a read in another workspace does not refresh this badge", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  replies.set(workspaceId, payload({ unread_count: 0 }));
  await act(async () => {
    await markConversationRead(otherWorkspaceId, "+15555550100");
  });
  expect(result.current).toBe(107);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("a queued old-workspace read cannot overwrite or refresh the new workspace", async () => {
  const { result, rerender } = renderHook(({ id }) => useUnreadConversationsCount(id), { initialProps: { id: workspaceId } });
  await settle();
  let finishOld!: (response: Response) => void;
  replies.set(workspaceId, () => new Promise((resolve) => { finishOld = resolve; }));
  await poll();
  await act(async () => { await markConversationRead(workspaceId, "+15555550100"); });
  rerender({ id: otherWorkspaceId });
  await settle();
  expect(result.current).toBe(20);
  await act(async () => {
    finishOld(Response.json({ unread_count: 0 }));
    await markConversationRead(workspaceId, "+15555550100");
  });
  expect(result.current).toBe(20);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test("a read that finishes after workspace navigation cannot refresh the new badge", async () => {
  const { result, rerender } = renderHook(({ id }) => useUnreadConversationsCount(id), { initialProps: { id: workspaceId } });
  await settle();
  let finishRead!: (response: Response) => void;
  readReply = () => new Promise((resolve) => { finishRead = resolve; });
  const read = markConversationRead(workspaceId, "+15555550100");
  rerender({ id: otherWorkspaceId });
  await settle();
  expect(result.current).toBe(20);
  replies.set(otherWorkspaceId, payload({ unread_count: 0 }));
  await act(async () => {
    finishRead(Response.json({ ok: true }));
    await read;
  });
  expect(result.current).toBe(20);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("failed read-triggered counts retain the badge until a successful poll", async () => {
  const { result } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  replies.set(workspaceId, payload({ error: "Count failed" }, 500));
  await act(async () => { await markConversationRead(workspaceId, "+15555550100"); });
  expect(result.current).toBe(107);
  replies.set(workspaceId, payload({ unread_count: 104 }));
  await poll();
  expect(result.current).toBe(104);
});

test("unmount removes local read listeners", async () => {
  const { unmount } = renderHook(() => useUnreadConversationsCount(workspaceId));
  await settle();
  unmount();
  await act(async () => { await markConversationRead(workspaceId, "+15555550100"); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
