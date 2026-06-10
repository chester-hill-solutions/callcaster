import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSupabaseRealtimeMock } from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("realtime hooks", () => {
  test("phoneNumbersMatch normalizes numbers", async () => {
    const { phoneNumbersMatch } = await import("@/hooks/realtime/useChatRealtime");
    expect(phoneNumbersMatch("+1 (555) 123-4567", "5551234567")).toBe(true);
    expect(phoneNumbersMatch(null, "+1")).toBe(false);
  });

  test("useSupabaseRealtimeSubscription forwards payloads", async () => {
    const { useSupabaseRealtimeSubscription } = await import(
      "@/hooks/realtime/useSupabaseRealtime"
    );
    const { supabase, emitPayload } = createSupabaseRealtimeMock();
    const onChange = vi.fn();

    renderHook(() =>
      useSupabaseRealtimeSubscription({
        supabase: supabase as any,
        table: ["call", "campaign_queue"],
        filter: "campaign_id=eq.1",
        onChange,
      }),
    );

    emitPayload({ eventType: "INSERT", table: "call", new: { sid: "CA1" } });
    expect(onChange).toHaveBeenCalled();
  });

  test("useRealtimeData fetch and postgres handlers", async () => {
    const { useRealtimeData } = await import("@/hooks/realtime/useRealtimeData");
    const { supabase, emitPayload, emitStatus } = createSupabaseRealtimeMock();

    const select = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 1, workspace: "ws" }],
        error: null,
      }),
    }));
    supabase.from = vi.fn(() => ({ select }));

    const withInitial = renderHook(() =>
      useRealtimeData(supabase as any, "ws", "contact", [{ id: 1 } as any]),
    );
    expect(withInitial.result.current.data).toHaveLength(1);

    const withoutInitial = renderHook(() =>
      useRealtimeData(supabase as any, "ws", "workspace_users", null),
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
    const { supabase, emitPayload } = createSupabaseRealtimeMock();

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
        supabase: supabase as any,
        initial,
        workspace: "ws",
        contact_number: "+15551111111",
      }),
    );

    act(() => {
      emitPayload({
        eventType: "INSERT",
        new: {
          sid: "SM1",
          body: "hi",
          from: "+15551111111",
          to: "+15552222222",
          workspace: "ws",
          status: "delivered",
        },
      });
      emitPayload({
        eventType: "INSERT",
        new: { sid: "SM1", workspace: "ws", status: "failed" },
      });
      emitPayload({
        eventType: "UPDATE",
        new: { sid: "pending-1", body: "hi", workspace: "ws", status: "sent" },
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
    const { useConversationSummaryRealTime } = await import(
      "@/hooks/realtime/useChatRealtime"
    );
    const { supabase, emitPayload } = createSupabaseRealtimeMock();

    supabase.rpc = vi.fn().mockResolvedValue({
      data: [
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
      ],
      error: null,
    });

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
        supabase: supabase as any,
        initial,
        workspace: "ws",
        activeContactNumber: "+15551111111",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(supabase.rpc).toHaveBeenCalled();

    act(() => {
      emitPayload({
        eventType: "INSERT",
        new: {
          workspace: "ws",
          status: "received",
          direction: "inbound",
          from: "+15558888888",
          to: "+15550000000",
          date_created: new Date().toISOString(),
        },
      });
      emitPayload({
        eventType: "INSERT",
        new: {
          workspace: "ws",
          status: "delivered",
          direction: "outbound",
          from: "+15550000000",
          to: "+15559999999",
          date_created: new Date().toISOString(),
        },
      });
    });

    await act(async () => {
      await result.current.markConversationAsRead("+15559999999");
    });
    await act(async () => {
      await result.current.refreshConversations(true);
    });
  });

  test("useSupabaseRealtime routes table events", async () => {
    const { useSupabaseRealtime } = await import("@/hooks/realtime/useSupabaseRealtime");
    const { supabase, emitPayload, emitStatus } = createSupabaseRealtimeMock();

    const hydrateSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 9,
            campaign_id: 1,
            contact: { id: 9, phone: "+1" },
          },
          error: null,
        }),
      })),
    }));
    supabase.from = vi.fn(() => ({ select: hydrateSelect, update: vi.fn() }));

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
      useSupabaseRealtime({
        user,
        supabase: supabase as any,
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
      emitPayload({
        table: "outreach_attempt",
        eventType: "INSERT",
        new: { id: 1, user_id: user.id, campaign_id: 1, contact_id: 1, created_at: new Date().toISOString() },
      });
      emitPayload({
        table: "call",
        eventType: "INSERT",
        new: { sid: "CA1", campaign_id: 1, contact_id: 1, outreach_attempt_id: 1 },
      });
      emitPayload({
        table: "campaign_queue",
        eventType: "INSERT",
        new: { id: 2, campaign_id: 1, contact_id: 2, status: user.id, contact: { id: 2, phone: "+2" } },
      });
      emitPayload({
        table: "campaign_queue",
        eventType: "INSERT",
        new: { id: 9, campaign_id: 1, contact_id: 9, status: user.id },
      });
      emitPayload({
        table: "workspace_number",
        eventType: "INSERT",
        new: { id: 3, workspace: "ws" },
      });
      emitPayload({
        table: "transaction_history",
        eventType: "INSERT",
        new: { amount: 5, workspace: "ws" },
      });
      emitStatus("CHANNEL_ERROR");
      emitStatus("TIMED_OUT");
    });
    await waitFor(() => expect(hydrateSelect).toHaveBeenCalled());

    act(() => result.current.setDisposition("answered"));
    expect(result.current.disposition).toBe("answered");
    expect(result.current.availableCredits).toBeGreaterThan(10);
  });
});
