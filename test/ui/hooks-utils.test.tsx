import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockFetcher, createSupabaseRealtimeMock } from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockUseFetcher = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useFetcher: () => mockUseFetcher() };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("utils hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("useDebounce runs callback after delay", async () => {
    const { useDebounce } = await import("@/hooks/utils/useDebounce");
    const cb = vi.fn();
    const { result } = renderHook(() => useDebounce(cb, 300));

    act(() => {
      result.current("a");
      result.current("b");
    });
    expect(cb).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(cb).toHaveBeenCalledWith("b");
  });

  test("useInterval ticks and pauses when delay is null", async () => {
    const { useInterval } = await import("@/hooks/utils/useInterval");
    const tick = vi.fn();
    const { rerender } = renderHook(
      ({ delay }: { delay: number | null }) => useInterval(tick, delay),
      { initialProps: { delay: 1000 as number | null } },
    );

    act(() => vi.advanceTimersByTime(1000));
    expect(tick).toHaveBeenCalledTimes(1);

    rerender({ delay: null });
    act(() => vi.advanceTimersByTime(5000));
    expect(tick).toHaveBeenCalledTimes(1);
  });

  test("useDebouncedSave submits and shows toasts", async () => {
    const fetcher = createMockFetcher({ state: "idle" });
    mockUseFetcher.mockReturnValue(fetcher);

    const useDebouncedSave = (await import("@/hooks/utils/useDebouncedSave")).default;
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    const base = {
      update: { q1: "a" },
      recentAttempt: { id: 9 } as any,
      nextRecipient: { id: 2, contact: { id: 10 } } as any,
      campaign: { id: 3 } as any,
      workspaceId: "ws1",
      disposition: "answered",
      toast,
    };

    const { result, rerender } = renderHook(
      (props) => useDebouncedSave(props),
      { initialProps: base },
    );

    rerender({ ...base, update: { q1: "b" } });
    act(() => vi.advanceTimersByTime(2000));
    expect(fetcher.submit).toHaveBeenCalled();

    act(() => result.current.saveData());

    rerender({ ...base, nextRecipient: { id: 2, contact: {} } as any });
    act(() => result.current.saveData());
    expect(toast.warning).toHaveBeenCalled();

    rerender({ ...base, update: { q1: "c" } });
    Object.assign(fetcher, { data: { error: "nope" } });
    rerender({ ...base, update: { q1: "d" } });
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => Promise.resolve());
    expect(toast.error).toHaveBeenCalled();
  });

  test("useOptimisticMutation and useOptimisticCollection rollback on error", async () => {
    const {
      useOptimisticMutation,
      useOptimisticCollection,
    } = await import("@/hooks/utils/useOptimisticMutation");

    const onRollback = vi.fn();
    const fetcher = createMockFetcher({ state: "submitting" });

    const { rerender: rerenderMutation } = renderHook(
      ({ data }) =>
        useOptimisticMutation({
          fetcher: { ...fetcher, state: "idle", data } as any,
          isError: (d) => Boolean((d as { error?: boolean })?.error),
          onRollback,
        }),
      { initialProps: { data: undefined as { error?: boolean } | undefined } },
    );

    rerenderMutation({ data: { error: true } });
    expect(onRollback).toHaveBeenCalled();

    const items = [{ id: 1, name: "a" }];
    const setItems = vi.fn();
    const fetcher2 = createMockFetcher({ state: "submitting" });

    const { result, rerender: rerenderCollection } = renderHook(
      ({ data }) =>
        useOptimisticCollection({
          items,
          setItems,
          fetcher: { ...fetcher2, state: "idle", data } as any,
          isError: (d) => Boolean((d as { error?: boolean })?.error),
        }),
      { initialProps: { data: undefined as { error?: boolean } | undefined } },
    );

    act(() => result.current.saveSnapshot());
    rerenderCollection({ data: { error: true } });
    expect(setItems).toHaveBeenCalled();
  });
});
