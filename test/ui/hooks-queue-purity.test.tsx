import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2156: `useQueue.updateQueue` called `setNextRecipient` and `setCallDuration`
 * from inside a `setQueue` updater. A `useState` updater must be pure — React
 * may invoke it more than once, and may replay or discard the result — so those
 * nested updates were neither guaranteed to run nor safe to run twice.
 *
 * A second defect sat in the same block: `if (!nextRecipientRef.current) …`
 * could essentially never be true, because `effectiveNextRecipient` falls back
 * to `queue[0]`.
 *
 * Note the fixtures. `getAssignedUserId` only treats a status as an assignment
 * when it is a UUID, and `isQueued` reads `queue_state` rather than `status`.
 * An item built as `{ status: user.id }` therefore takes the *removal* branch,
 * which is why the pre-existing `hooks-queue.test.tsx` asserts nothing about
 * the resulting queue — its assignment path was never reached.
 */
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useQueue } from "@/hooks/queue/useQueue";
import type { QueueItem } from "@/lib/types";

const AGENT_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000009";
const user = { id: AGENT_ID } as unknown as Parameters<typeof useQueue>[0]["user"];

function queueItem(
  id: number,
  contactId: number,
  overrides: Record<string, unknown> = {},
): QueueItem {
  return {
    id,
    contact_id: contactId,
    campaign_id: 1,
    queue_state: "queued",
    status: "queued",
    attempts: 0,
    dequeued_at: null,
    contact: { id: contactId, phone: `+1555000${id}` },
    ...overrides,
  } as unknown as QueueItem;
}

/** Queued and assigned to this agent — the manual-dial path. */
const assignedToMe = (id: number, contactId: number, extra = {}) =>
  queueItem(id, contactId, { assigned_to_user_id: AGENT_ID, status: AGENT_ID, ...extra });

/** Queued but unassigned. */
const queued = (id: number, contactId: number, extra = {}) =>
  queueItem(id, contactId, extra);

type Wrapper = (props: { children: ReactNode }) => ReactNode;

function renderQueue(
  options: {
    initialQueue?: QueueItem[];
    initialPredictiveQueue?: QueueItem[];
    isPredictive?: boolean;
    setCallDuration?: (n: number) => void;
    wrapper?: Wrapper;
  } = {},
) {
  const setCallDuration = options.setCallDuration ?? vi.fn();
  return renderHook(
    () =>
      useQueue({
        initialQueue: options.initialQueue ?? [],
        initialPredictiveQueue: options.initialPredictiveQueue ?? [],
        user,
        isPredictive: options.isPredictive ?? false,
        campaign_id: "1",
        setCallDuration,
      }),
    options.wrapper ? { wrapper: options.wrapper as never } : undefined,
  );
}

describe("useQueue.updateQueue — purity (#2156)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("a StrictMode double render settles on the same state as a single render", () => {
    const single = renderQueue({ initialQueue: [queued(1, 1)] });
    const doubled = renderQueue({
      initialQueue: [queued(1, 1)],
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    const add = (hook: typeof single) => {
      act(() => {
        hook.result.current.updateQueue({ new: assignedToMe(2, 2) as never });
      });
    };

    add(single);
    add(doubled);

    expect(doubled.result.current.queue.map((q) => q.id)).toEqual(
      single.result.current.queue.map((q) => q.id),
    );
    expect(doubled.result.current.nextRecipient?.id).toBe(
      single.result.current.nextRecipient?.id,
    );
  });

  test("a predictive row assigned to me resets the call duration exactly once", () => {
    const setCallDuration = vi.fn();
    const { result } = renderQueue({
      isPredictive: true,
      initialPredictiveQueue: [queued(1, 1)],
      setCallDuration,
    });

    act(() => {
      result.current.updateQueue({ new: assignedToMe(2, 2) as never });
    });

    // Previously issued from inside the updater, where a replayed or discarded
    // update could drop it or fire it twice.
    expect(setCallDuration).toHaveBeenCalledTimes(1);
    expect(setCallDuration).toHaveBeenCalledWith(0);
  });

  test("a predictive row assigned to someone else does not reset the duration", () => {
    const setCallDuration = vi.fn();
    const { result } = renderQueue({
      isPredictive: true,
      initialPredictiveQueue: [queued(1, 1)],
      setCallDuration,
    });

    act(() => {
      result.current.updateQueue({
        new: queueItem(3, 3, {
          assigned_to_user_id: "9b6f0a52-6f5e-4b2d-9d55-0000000000ff",
          status: "9b6f0a52-6f5e-4b2d-9d55-0000000000ff",
        }) as never,
      });
    });

    expect(setCallDuration).not.toHaveBeenCalled();
  });

  test("a row assigned to me replaces its own contact's row and is added", () => {
    const { result } = renderQueue({ initialQueue: [queued(1, 1)] });

    act(() => {
      result.current.updateQueue({ new: assignedToMe(2, 2) as never });
    });

    expect(result.current.queue.map((q) => q.id).sort()).toEqual([1, 2]);
  });

  test("two updates in one tick compose instead of clobbering each other", () => {
    const { result } = renderQueue({ initialQueue: [queued(1, 1)] });

    act(() => {
      result.current.updateQueue({ new: assignedToMe(2, 2) as never });
      result.current.updateQueue({ new: assignedToMe(3, 3) as never });
    });

    // A ref synced only in an effect would let the second call compute from
    // the pre-update queue and lose the first row's addition.
    expect(result.current.queue.map((q) => q.id).sort()).toEqual([1, 2, 3]);
  });

  test("an external setQueue is picked up by the next update", () => {
    const { result } = renderQueue({ initialQueue: [queued(1, 1)] });

    act(() => {
      result.current.setQueue([queued(1, 1), queued(5, 5)]);
    });

    act(() => {
      result.current.updateQueue({ new: assignedToMe(2, 2) as never });
    });

    // useCallScreen and useCampaignQueueFlow both hold this setter, so an
    // update must build on what they wrote rather than on a stale snapshot.
    expect(result.current.queue.map((q) => q.id).sort()).toEqual([1, 2, 5]);
  });

  test("removing the current recipient advances to the next uncontacted row", () => {
    const { result } = renderQueue({
      initialQueue: [queued(1, 1, { attempts: 0 }), queued(2, 2, { attempts: 0 })],
    });

    expect(result.current.nextRecipient?.id).toBe(1);

    act(() => {
      result.current.updateQueue({
        new: queueItem(1, 1, {
          queue_state: "dequeued",
          dequeued_at: new Date().toISOString(),
        }) as never,
      });
    });

    expect(result.current.nextRecipient?.id).toBe(2);
  });

  test("removing a row that is not the current recipient leaves it alone", () => {
    const { result } = renderQueue({
      initialQueue: [queued(1, 1, { attempts: 0 }), queued(2, 2, { attempts: 0 })],
    });

    act(() => {
      result.current.updateQueue({
        new: queueItem(2, 2, {
          queue_state: "dequeued",
          dequeued_at: new Date().toISOString(),
        }) as never,
      });
    });

    expect(result.current.nextRecipient?.id).toBe(1);
  });

  test("removing a recipient that is NOT queue[0] still advances to the next uncontacted row", () => {
    const { result } = renderQueue({
      initialQueue: [
        queued(1, 1, { attempts: 3 }), // already dialled
        queued(2, 2, { attempts: 0 }), // the one the advance should land on
        queued(3, 3, { attempts: 0 }),
      ],
    });

    // Point the recipient at the last row, so it is neither queue[0] nor the
    // row the advance would pick.
    const lastRow = result.current.queue[2];
    expect(lastRow?.id).toBe(3);
    act(() => {
      result.current.setNextRecipient(lastRow ?? null);
    });
    expect(result.current.nextRecipient?.id).toBe(3);

    act(() => {
      result.current.updateQueue({
        new: queueItem(3, 3, {
          queue_state: "dequeued",
          dequeued_at: new Date().toISOString(),
        }) as never,
      });
    });

    // Row 2 is the next uncontacted row, and it is NOT queue[0] — row 1 is, and
    // it has already been dialled three times. Setting `nextRecipient` to null
    // would fall back to `queue[0]` and hand the agent the exhausted row, so
    // this is the only shape where the advance is observable.
    expect(result.current.queue.map((q) => q.id)).toEqual([1, 2]);
    expect(result.current.nextRecipient?.id).toBe(2);
  });

  test("an invalid payload is rejected before anything is written", () => {
    const setCallDuration = vi.fn();
    const { result } = renderQueue({
      initialQueue: [queued(1, 1)],
      setCallDuration,
    });

    act(() => {
      result.current.updateQueue({} as never);
      result.current.updateQueue({ new: { id: 0 } } as never);
    });

    expect(result.current.queue.map((q) => q.id)).toEqual([1]);
    expect(setCallDuration).not.toHaveBeenCalled();
  });
});
