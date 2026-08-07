import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockFetcher, createWorkspaceRealtimeMock } from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockUseFetcher = vi.fn();
const mockUseBlocker = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: () => mockUseFetcher(),
    useBlocker: (fn: unknown) => mockUseBlocker(fn),
  };
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

  test("useDebouncedSave silent option suppresses success toast but keeps error toast", async () => {
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
      silent: true,
    };

    const { rerender } = renderHook(
      (props) => useDebouncedSave(props),
      { initialProps: base },
    );

    Object.assign(fetcher, { data: { id: 1 } });
    rerender({ ...base, update: { q1: "b" } });
    await act(async () => Promise.resolve());
    expect(toast.success).not.toHaveBeenCalled();

    Object.assign(fetcher, { data: { error: "nope" } });
    rerender({ ...base, update: { q1: "c" } });
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

  describe("useUnsavedChangesGuard", () => {
    afterEach(() => {
      mockUseBlocker.mockReset();
    });

    test("blocker predicate only blocks when changed and navigating to a different path", async () => {
      mockUseBlocker.mockReturnValue({ state: "unblocked" });
      const { useUnsavedChangesGuard } = await import(
        "@/hooks/utils/useUnsavedChangesGuard"
      );

      renderHook(() => useUnsavedChangesGuard(true));
      const predicate = mockUseBlocker.mock.calls[0]?.[0] as (args: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) => boolean;

      expect(
        predicate({
          currentLocation: { pathname: "/a" },
          nextLocation: { pathname: "/b" },
        }),
      ).toBe(true);
      expect(
        predicate({
          currentLocation: { pathname: "/a" },
          nextLocation: { pathname: "/a" },
        }),
      ).toBe(false);
    });

    test("proceeds when the user confirms leaving a blocked navigation", async () => {
      const proceed = vi.fn();
      const reset = vi.fn();
      mockUseBlocker.mockReturnValue({ state: "blocked", proceed, reset });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      const { useUnsavedChangesGuard } = await import(
        "@/hooks/utils/useUnsavedChangesGuard"
      );
      renderHook(() => useUnsavedChangesGuard(true));

      expect(confirmSpy).toHaveBeenCalled();
      expect(proceed).toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    test("resets when the user cancels leaving a blocked navigation", async () => {
      const proceed = vi.fn();
      const reset = vi.fn();
      mockUseBlocker.mockReturnValue({ state: "blocked", proceed, reset });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      const { useUnsavedChangesGuard } = await import(
        "@/hooks/utils/useUnsavedChangesGuard"
      );
      renderHook(() => useUnsavedChangesGuard(true));

      expect(reset).toHaveBeenCalled();
      expect(proceed).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    test("warns on beforeunload only while changes are unsaved", async () => {
      mockUseBlocker.mockReturnValue({ state: "unblocked" });
      const { useUnsavedChangesGuard } = await import(
        "@/hooks/utils/useUnsavedChangesGuard"
      );

      const { rerender } = renderHook(
        ({ isChanged }) => useUnsavedChangesGuard(isChanged),
        { initialProps: { isChanged: true } },
      );

      const event = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      window.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();

      rerender({ isChanged: false });
      const event2 = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;
      const preventDefaultSpy2 = vi.spyOn(event2, "preventDefault");
      window.dispatchEvent(event2);
      expect(preventDefaultSpy2).not.toHaveBeenCalled();
    });
  });
});
