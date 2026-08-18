import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkspaceEventSourceMock } from "./hooks-test-helpers";

// Deliberately do NOT mock @/hooks/queue/useQueue (unlike
// test/ui/hooks-realtime.test.tsx): this regression needs the real queue
// reducer so a campaign_queue dequeue event actually collapses
// nextRecipient, the way hangup.action.server.ts's dequeue does in
// production.
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/chats/messaging-client", () => ({
  fetchCampaignQueueItemWithContact: vi.fn(),
}));

describe("useWorkspaceRealtime — #1253 post-hangup questionContact", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("does not null out questionContact when a hangup-triggered dequeue empties the queue", async () => {
    const { useWorkspaceRealtime } = await import(
      "@/hooks/realtime/useWorkspaceRealtime"
    );
    const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();

    const user = { id: "user-1" };
    const soleContact = {
      id: 5,
      campaign_id: 1,
      contact_id: 1,
      status: user.id,
      contact: { id: 1, phone: "+15551234567" },
    };
    const init = {
      queue: [soleContact],
      predictiveQueue: [],
      callsList: [],
      attempts: [],
      recentCall: null,
      recentAttempt: null,
      nextRecipient: null,
      phoneNumbers: [],
      credits: 0,
    } as any;

    const setQuestionContact = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceRealtime({
        user,
        init,
        campaign_id: 1,
        predictive: false,
        setQuestionContact,
        workspace: "ws",
        setCallDuration: vi.fn(),
        setUpdate: vi.fn(),
      } as any),
    );

    // The queue starts with the one contact as nextRecipient (matches the
    // call screen's initial state — the agent is mid-call with them).
    expect(result.current.nextRecipient).toMatchObject({ id: 5, contact_id: 1 });

    // hangup.action.server.ts dequeues the just-finished contact's queue row
    // synchronously on hangup; that shows up here as a campaign_queue UPDATE
    // carrying dequeued_at.
    act(() => {
      emitWorkspaceEvent({
        table: "campaign_queue",
        eventType: "UPDATE",
        new: {
          ...soleContact,
          dequeued_at: new Date().toISOString(),
          dequeued_reason: "Call completed",
        },
        old: soleContact,
      });
    });

    // Reproduces the #1253 screenshot: "0 of 1 remaining" — the queue's
    // forward pointer collapses to null once the sole contact is dequeued.
    await waitFor(() => expect(result.current.nextRecipient).toBeNull());

    // The regression: questionContact — who the script/disposition panel is
    // recording an outcome for — must NOT be forced to null just because the
    // queue emptied. Before the fix, useWorkspaceRealtime unconditionally
    // mirrored nextRecipient into questionContact on every change, so this
    // call would have fired with `null` right here.
    expect(setQuestionContact).not.toHaveBeenCalledWith(null);
  });
});
