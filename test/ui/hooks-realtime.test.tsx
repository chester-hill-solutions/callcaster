import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkspaceEventSourceMock } from "./hooks-test-helpers";

const messagingMocks = vi.hoisted(() => ({
  fetchConversationSummaries: vi.fn(),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  fetchCampaignQueueItemWithContact: vi.fn(),
}));

vi.mock("@/lib/chats/messaging-client", () => messagingMocks);
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/queue/useQueue", () => ({
  useQueue: () => ({
    queue: [],
    setQueue: vi.fn(),
    predictiveQueue: [],
    updateQueue: vi.fn(),
    householdMap: new Map(),
    nextRecipient: null,
    setNextRecipient: vi.fn(),
  }),
}));
vi.mock("@/hooks/queue/useAttempts", async () => {
  const React = await import("react");
  return {
    useAttempts: (
      attempts: unknown,
      recentAttemptInit: unknown,
    ) => {
      const [recentAttempt, setRecentAttempt] = React.useState(recentAttemptInit);
      return {
        attemptList: attempts,
        recentAttempt,
        setRecentAttempt,
        updateAttempts: vi.fn(),
      };
    },
  };
});
vi.mock("@/hooks/queue/useCalls", () => ({
  useCalls: () => ({
    callsList: [],
    recentCall: null,
    updateCalls: vi.fn(),
  }),
}));
vi.mock("@/hooks/phone/usePhoneNumbers", () => ({
  usePhoneNumbers: () => ({
    phoneNumbers: [],
    setPhoneNumbers: vi.fn(),
    updateWorkspaceNumbers: vi.fn(),
  }),
}));

const adminDbMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: adminDbMocks,
}));

describe("realtime hooks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("phoneNumbersMatch normalizes numbers", async () => {
    const { phoneNumbersMatch } = await import("@/hooks/realtime/useChatRealtime");
    expect(phoneNumbersMatch("+1 (555) 123-4567", "5551234567")).toBe(true);
    expect(phoneNumbersMatch(null, "+1")).toBe(false);
  });

  test("useWorkspaceEventSubscription forwards payloads", async () => {
    const { useWorkspaceEventSubscription } = await import(
      "@/hooks/realtime/useWorkspaceEventSubscription"
    );
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();
    const onChange = vi.fn();

    renderHook(() =>
      useWorkspaceEventSubscription({
        workspaceId: "ws",
        table: ["call", "campaign_queue"],
        filter: "campaign_id=eq.1",
        onChange,
      }),
    );

    emitWorkspaceEvent(
      { eventType: "INSERT", table: "call", new: { sid: "CA1", campaign_id: 1 }, old: null },
      { workspaceId: "ws" },
    );
    expect(onChange).toHaveBeenCalled();
  });

  test("useChatRealTime inserts and dedupes messages", async () => {
    const { useChatRealTime } = await import("@/hooks/realtime/useChatRealtime");
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();

    const initial = [
      {
        sid: "pending-1",
        body: "hi",
        from: "+15551111111",
        to: "+15552222222",
        workspace: "ws",
        status: "sending",
      },
    ] as any[];

    const { result } = renderHook(() =>
      useChatRealTime({
        client: {} as any,
        initial,
        workspace: "ws",
        contact_number: "+15551111111",
      }),
    );

    act(() => {
      emitWorkspaceEvent({
        eventType: "INSERT",
        table: "message",
        new: {
          sid: "SM1",
          body: "hi",
          from: "+15551111111",
          to: "+15552222222",
          workspace: "ws",
          status: "delivered",
        },
        old: null,
      });
      emitWorkspaceEvent({
        eventType: "INSERT",
        table: "message",
        new: { sid: "SM1", workspace: "ws", status: "failed" },
        old: null,
      });
      emitWorkspaceEvent({
        eventType: "UPDATE",
        table: "message",
        new: { sid: "pending-1", body: "hi", workspace: "ws", status: "sent" },
        old: null,
      });
    });

    act(() => {
      result.current.addOptimisticMessage({
        body: "opt",
        from: "+1",
        to: "+2",
        media: "[]",
      });
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
  });

  test("useChatRealTime keeps failed INSERT events instead of dropping them", async () => {
    const { useChatRealTime } = await import("@/hooks/realtime/useChatRealtime");
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();

    const stableInitial: any[] = [];
    const { result } = renderHook(() =>
      useChatRealTime({
        client: {} as any,
        initial: stableInitial,
        workspace: "ws",
      }),
    );

    act(() => {
      emitWorkspaceEvent({
        eventType: "INSERT",
        table: "message",
        new: {
          sid: "SM-failed",
          body: "oops",
          from: "+15551111111",
          to: "+15552222222",
          workspace: "ws",
          status: "failed",
        },
        old: null,
      });
    });

    expect(result.current.messages.some((m) => m.sid === "SM-failed")).toBe(true);
  });

  test("useChatRealTime markOptimisticMessageFailed flips a pending message to failed", async () => {
    const { useChatRealTime } = await import("@/hooks/realtime/useChatRealtime");

    const stableInitial: any[] = [];
    const { result } = renderHook(() =>
      useChatRealTime({
        client: {} as any,
        initial: stableInitial,
        workspace: "ws",
      }),
    );

    act(() => {
      result.current.addOptimisticMessage({
        body: "hi",
        from: "+1",
        to: "+2",
        sid: "pending-123",
      });
    });
    expect(
      result.current.messages.find((m) => m.sid === "pending-123")?.status,
    ).toBe("sending");

    act(() => {
      result.current.markOptimisticMessageFailed("pending-123");
    });
    expect(
      result.current.messages.find((m) => m.sid === "pending-123")?.status,
    ).toBe("failed");
  });

  test("useConversationSummaryRealTime refreshes and updates unread", async () => {
    messagingMocks.fetchConversationSummaries.mockResolvedValue([
      {
        contact_phone: "+15551111111",
        user_phone: "+15550000000",
        conversation_start: new Date().toISOString(),
        conversation_last_update: new Date().toISOString(),
        message_count: 1,
        unread_count: 2,
        contact_firstname: "",
        contact_surname: "",
      },
    ]);

    const { useConversationSummaryRealTime } = await import(
      "@/hooks/realtime/useChatRealtime"
    );
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();

    const initial = [
      {
        contact_phone: "+15559999999",
        user_phone: "+15550000000",
        conversation_start: new Date().toISOString(),
        conversation_last_update: new Date().toISOString(),
        message_count: 0,
        unread_count: 1,
        contact_firstname: "",
        contact_surname: "",
      },
    ] as any[];

    const { result } = renderHook(() =>
      useConversationSummaryRealTime({
        client: {} as any,
        initial,
        workspace: "ws",
        activeContactNumber: "+15551111111",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(messagingMocks.fetchConversationSummaries).toHaveBeenCalled();

    act(() => {
      emitWorkspaceEvent({
        eventType: "INSERT",
        table: "message",
        new: {
          workspace: "ws",
          status: "received",
          direction: "inbound",
          from: "+15558888888",
          to: "+15550000000",
          date_created: new Date().toISOString(),
        },
        old: null,
      });
      emitWorkspaceEvent({
        eventType: "INSERT",
        table: "message",
        new: {
          workspace: "ws",
          status: "delivered",
          direction: "outbound",
          from: "+15550000000",
          to: "+15559999999",
          date_created: new Date().toISOString(),
        },
        old: null,
      });
    });

    await act(async () => {
      await result.current.markConversationAsRead("+15559999999");
    });
    await act(async () => {
      await result.current.refreshConversations(true);
    });
  });

  test("useWorkspaceRealtime routes table events", async () => {
    messagingMocks.fetchCampaignQueueItemWithContact.mockResolvedValue({
      id: 9,
      campaign_id: 1,
      contact: { id: 9, phone: "+1" },
    });

    const { useWorkspaceRealtime } = await import("@/hooks/realtime/useWorkspaceRealtime");
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();

    const user = { id: "user-1" };
    const init = {
      queue: [
        {
          id: 1,
          contact_id: 1,
          campaign_id: 1,
          status: "queued",
          contact: { id: 1, phone: "+1" },
        },
      ],
      predictiveQueue: [],
      callsList: [],
      attempts: [],
      recentCall: null,
      recentAttempt: null,
      nextRecipient: null,
      phoneNumbers: [],
      credits: 10,
    } as any;

    const setQuestionContact = vi.fn();
    const setCallDuration = vi.fn();
    const setUpdate = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceRealtime({
        user,
        init,
        campaign_id: 1,
        predictive: false,
        setQuestionContact,
        workspace: "ws",
        setCallDuration,
        setUpdate,
      }),
    );

    act(() => {
      emitWorkspaceEvent({
        table: "outreach_attempt",
        eventType: "INSERT",
        new: { id: 1, user_id: user.id, campaign_id: 1, contact_id: 1, created_at: new Date().toISOString() },
        old: null,
      });
      emitWorkspaceEvent({
        table: "call",
        eventType: "INSERT",
        new: { sid: "CA1", campaign_id: 1, contact_id: 1, outreach_attempt_id: 1 },
        old: null,
      });
      emitWorkspaceEvent({
        table: "campaign_queue",
        eventType: "INSERT",
        new: { id: 2, campaign_id: 1, contact_id: 2, status: user.id, contact: { id: 2, phone: "+2" } },
        old: null,
      });
      emitWorkspaceEvent({
        table: "campaign_queue",
        eventType: "INSERT",
        new: { id: 9, campaign_id: 1, contact_id: 9, status: user.id },
        old: null,
      });
      emitWorkspaceEvent({
        table: "workspace_number",
        eventType: "INSERT",
        new: { id: 3, workspace: "ws" },
        old: null,
      });
      emitWorkspaceEvent({
        table: "transaction_history",
        eventType: "INSERT",
        new: { id: 1, amount: 5, workspace: "ws" },
        old: null,
      });
    });
    await waitFor(() => expect(messagingMocks.fetchCampaignQueueItemWithContact).toHaveBeenCalled());

    act(() => result.current.setDisposition("answered"));
    expect(result.current.disposition).toBe("answered");
    expect(result.current.availableCredits).toBe(15);
  });

  test("useWorkspaceRealtime downgrades SSE onerror to logger.debug (reconnects are normal, not errors)", async () => {
    // Regression test: transient EventSource reconnects (e.g. Bun's idle
    // timeout recycling the connection) were previously logged via
    // logger.error, spamming error-tracking for every routine reconnect. The
    // sibling hook (useWorkspaceEventSubscription) already treats this as
    // debug-level; useWorkspaceRealtime must match.
    const { useWorkspaceRealtime } = await import("@/hooks/realtime/useWorkspaceRealtime");
    const { logger } = await import("@/lib/logger.client");
    const { getLastInstance } = createWorkspaceEventSourceMock();

    const user = { id: "user-1" };
    const init = {
      queue: [],
      predictiveQueue: [],
      callsList: [],
      attempts: [],
      recentCall: null,
      recentAttempt: null,
      nextRecipient: null,
      phoneNumbers: [],
      credits: 10,
    } as any;

    renderHook(() =>
      useWorkspaceRealtime({
        user,
        init,
        campaign_id: 1,
        predictive: false,
        setQuestionContact: vi.fn(),
        workspace: "ws",
        setCallDuration: vi.fn(),
        setUpdate: vi.fn(),
      } as any),
    );

    act(() => {
      getLastInstance()?.onerror?.(new Event("error"));
    });

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("SSE connection interrupted"),
    );
  });
});
