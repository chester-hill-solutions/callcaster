import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  useCreditReconciliation,
  CREDIT_RECONCILE_INTERVAL_MS,
  CREDIT_RECONCILE_WINDOW_MS,
} from "@/hooks/billing/useCreditReconciliation";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type HookProps = {
  isTerminal: boolean;
  credits: number;
  reconcile: (workspaceId: string) => Promise<number | null>;
};

function renderReconciliation(initial: Partial<HookProps> = {}) {
  const reconcile = vi.fn().mockResolvedValue(null);
  const utils = renderHook(
    (props: HookProps) =>
      useCreditReconciliation({ workspaceId: "ws-1", ...props }),
    {
      initialProps: {
        isTerminal: false,
        credits: 10,
        reconcile,
        ...initial,
      },
    },
  );
  return { ...utils, reconcile };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCreditReconciliation", () => {
  test("does not poll while the call is not terminal", () => {
    const { reconcile } = renderReconciliation();
    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_WINDOW_MS));
    expect(reconcile).not.toHaveBeenCalled();
  });

  test("polls every 2s once the call reaches a terminal state", () => {
    const { rerender, reconcile } = renderReconciliation();

    rerender({ isTerminal: true, credits: 10, reconcile });
    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS * 3));

    expect(reconcile).toHaveBeenCalledTimes(3);
    expect(reconcile).toHaveBeenCalledWith("ws-1");
  });

  test("stops polling as soon as the balance moves", () => {
    const { rerender, reconcile } = renderReconciliation({ isTerminal: true });

    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS));
    expect(reconcile).toHaveBeenCalledTimes(1);

    // An SSE debit (or applied snapshot) changes the balance.
    rerender({ isTerminal: true, credits: 9, reconcile });
    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS * 5));

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  test("gives up after the 30s window", () => {
    const { reconcile } = renderReconciliation({ isTerminal: true });

    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_WINDOW_MS * 2));

    // Ticks at 2s..28s fetch; the 30s tick observes the deadline and stops.
    expect(reconcile).toHaveBeenCalledTimes(
      CREDIT_RECONCILE_WINDOW_MS / CREDIT_RECONCILE_INTERVAL_MS - 1,
    );
  });

  test("stops when a new dial starts (terminal state clears)", () => {
    const { rerender, reconcile } = renderReconciliation({ isTerminal: true });

    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS));
    expect(reconcile).toHaveBeenCalledTimes(1);

    rerender({ isTerminal: false, credits: 10, reconcile });
    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS * 5));

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  test("a failed poll is swallowed and the next tick retries", async () => {
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(null);
    renderReconciliation({ isTerminal: true, reconcile });

    await act(async () => {
      vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  test("a fresh terminal call after a new dial restarts the window", () => {
    const { rerender, reconcile } = renderReconciliation({ isTerminal: true });

    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_WINDOW_MS * 2));
    const firstWindowCalls = reconcile.mock.calls.length;

    // New dial, then the next call ends.
    rerender({ isTerminal: false, credits: 10, reconcile });
    rerender({ isTerminal: true, credits: 10, reconcile });
    act(() => vi.advanceTimersByTime(CREDIT_RECONCILE_INTERVAL_MS * 2));

    expect(reconcile.mock.calls.length).toBe(firstWindowCalls + 2);
  });
});
