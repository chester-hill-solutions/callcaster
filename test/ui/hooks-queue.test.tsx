import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const user = { id: "user-1" } as any;

function queueItem(
  id: number,
  contactId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    contact_id: contactId,
    campaign_id: 1,
    status: "queued",
    attempts: 0,
    contact: { id: contactId, phone: `+1555000${id}` },
    ...overrides,
  } as any;
}

describe("queue hooks", () => {
  test("useCalls handles insert, update, and validation", async () => {
    const { useCalls } = await import("@/hooks/queue/useCalls");
    const setNext = vi.fn();
    const setQuestion = vi.fn();
    const setAttempt = vi.fn();

    const { result } = renderHook(() =>
      useCalls(
        [{ sid: "old", outreach_attempt_id: 1, contact_id: 1 } as any],
        { sid: "old", outreach_attempt_id: 1, contact_id: 1 } as any,
        [queueItem(1, 1)],
        setNext,
        false,
      ),
    );

    act(() => {
      result.current.updateCalls(
        { new: { sid: "new", outreach_attempt_id: 2, contact_id: 2 } as any, eventType: "INSERT" },
        [queueItem(2, 2)],
        null,
        setNext,
        setQuestion,
        setAttempt,
      );
    });
    expect(result.current.recentCall?.sid).toBe("new");

    act(() => {
      result.current.updateCalls(
        { new: { sid: "new", outreach_attempt_id: 2, contact_id: 2, status: "completed" } as any, eventType: "UPDATE" },
        [],
        null,
        setNext,
        setQuestion,
        setAttempt,
      );
    });

    act(() => {
      result.current.updateCalls(
        { new: { sid: "x", contact_id: 3 } as any },
        [],
        null,
        setNext,
        setQuestion,
        setAttempt,
      );
    });

    act(() => {
      result.current.updateCalls({} as any, [], null, setNext, setQuestion, setAttempt);
      result.current.updateCalls({ new: {} as any }, [], null, setNext, setQuestion, setAttempt);
    });
  });

  test("useAttempts updates list and recent attempt", async () => {
    const { useAttempts } = await import("@/hooks/queue/useAttempts");
    const recipient = queueItem(5, 5);
    const { result } = renderHook(() =>
      useAttempts([], null, recipient),
    );

    const attempt = {
      id: 10,
      user_id: user.id,
      campaign_id: 1,
      contact_id: 5,
      created_at: new Date().toISOString(),
    } as any;

    act(() => {
      result.current.updateAttempts(
        { new: attempt },
        user,
        1,
        [{ outreach_attempt_id: 10, direction: "inbound" } as any],
      );
    });
    expect(result.current.attemptList).toHaveLength(1);

    act(() => {
      result.current.updateAttempts({ new: { ...attempt, id: 10 } }, user, 1, []);
    });

    act(() => {
      result.current.updateAttempts({ new: attempt }, user, 2, []);
      result.current.updateAttempts({} as any, user, 1, []);
      result.current.updateAttempts({ new: {} as any }, user, 1, []);
      result.current.updateAttempts({ new: attempt }, {} as any, 1, []);
    });
  });

  test("useQueue standard and predictive paths", async () => {
    const { useQueue } = await import("@/hooks/queue/useQueue");
    const setCallDuration = vi.fn();
    const initial = [queueItem(1, 1, { status: "queued" })];

    const { result } = renderHook(() =>
      useQueue({
        initialQueue: initial,
        initialPredictiveQueue: [queueItem(2, 2)],
        user,
        isPredictive: false,
        campaign_id: "1",
        setCallDuration,
      }),
    );

    expect(result.current.nextRecipient?.id).toBe(1);

    act(() => {
      result.current.updateQueue({
        new: queueItem(3, 3, { status: user.id, contact: { id: 3, phone: "+1" } }),
      });
    });

    act(() => {
      result.current.updateQueue({
        new: queueItem(1, 1, { status: "dequeued", dequeued_at: new Date().toISOString() }),
      });
    });

    const predictive = renderHook(() =>
      useQueue({
        initialQueue: [],
        initialPredictiveQueue: [queueItem(4, 4, { status: "queued" })],
        user,
        isPredictive: true,
        campaign_id: "1",
        setCallDuration,
      }),
    );

    act(() => {
      predictive.result.current.updateQueue({
        new: queueItem(4, 4, { status: user.id, contact: { id: 4, phone: "+1" } }),
      });
    });

    act(() => {
      result.current.updateQueue({} as any);
      result.current.updateQueue({ new: { id: 0 } as any });
    });
  });
});
