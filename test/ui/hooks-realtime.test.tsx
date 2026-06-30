import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkspaceRealtimeMock, createWorkspaceEventSourceMock } from "./hooks-test-helpers";

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

  test("useRealtimeData fetch and postgres handlers", async () => {
    const { useRealtimeData } = await import("@/hooks/realtime/useRealtimeData");
    const { client, emitPayload, emitStatus } = createWorkspaceRealtimeMock();

    const select = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 1, workspace: "ws" }],
        error: null,
      }),
    }));
    adminDb.from = vi.fn(() => ({ select }));

    const withInitial = renderHook(() =>
      useRealtimeData(client as any, "ws", "contact", [{ id: 1 } as any]),
    );
    expect(withInitial.result.current.data).toHaveLength(1);

    const withoutInitial = renderHook(() =>
      useRealtimeData(client as any, "ws", "workspace_users", null),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(withoutInitial.result.current.data?.length).toBe(1);

    act(() => {
      emitPayload({ eventType: "INSERT", new: { id: 2, workspace: "ws" } });
      emitPayload({ eventType: "INSERT", new: { id: 2, workspace: "ws" } });
      emitPayload({ eventType: "UPDATE", new: { id: 1, workspace: "ws", name: "n" } });
      emitPayload({ eventType: "UPDATE", new: { id: 99, workspace: "ws" } });
      emitPayload({ eventType: "DELETE", old: { id: 1, workspace: "ws" } });
      emitPayload({ eventType: "DELETE", old: { id: 99, workspace: "ws" } });
      emitStatus("CHANNEL_ERROR");
      emitStatus("TIMED_OUT");
      emitStatus("CLOSED");
    });
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
        new: { amount: 5, workspace: "ws" },
        old: null,
      });
    });
    await waitFor(() => expect(messagingMocks.fetchCampaignQueueItemWithContact).toHaveBeenCalled());

    act(() => result.current.setDisposition("answered"));
    expect(result.current.disposition).toBe("answered");
    expect(result.current.availableCredits).toBeGreaterThan(10);
  });
});
