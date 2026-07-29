import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installIntersectionObserverMock } from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("root hooks", () => {
  const multiKeys = ["a", "b"] as Array<"a" | "b">;
  const multiStorageOptions = {};

  const createMemoryStorage = (): Storage => {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key) {
        return store.has(key) ? store.get(key)! : null;
      },
      key(index) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key) {
        store.delete(key);
      },
      setItem(key, value) {
        store.set(key, value);
      },
    };
  };

  const ensureStorage = (name: "localStorage" | "sessionStorage") => {
    const storage = globalThis[name] as Partial<Storage> | undefined;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function" &&
      typeof storage.removeItem === "function"
    ) {
      return storage as Storage;
    }

    const shim = createMemoryStorage();
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: shim,
    });
    return shim;
  };

  const resetStorage = (storage: Storage & { clear?: (() => void) | undefined }) => {
    if (typeof storage.clear === "function") {
      storage.clear();
      return;
    }

    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key) {
        storage.removeItem(key);
      }
    }
  };

  beforeEach(() => {
    resetStorage(ensureStorage("localStorage"));
    resetStorage(ensureStorage("sessionStorage"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("useLocalStorage, multi, and session storage", async () => {
    const {
      useLocalStorage,
      useLocalStorageMulti,
      useSessionStorage,
    } = await import("@/hooks/useLocalStorage");

    localStorage.setItem("k1", JSON.stringify({ a: 1 }));
    const ls = renderHook(() => useLocalStorage<{ a: number }>("k1"));
    expect(ls.result.current[0]).toEqual({ a: 1 });

    act(() => ls.result.current[1]({ a: 2 }));
    expect(JSON.parse(localStorage.getItem("k1")!)).toEqual({ a: 2 });

    act(() => ls.result.current[1](null));
    act(() => ls.result.current[2]());

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "k1",
          newValue: JSON.stringify({ a: 9 }),
        }),
      );
    });
    await waitFor(() => expect(ls.result.current[0]).toEqual({ a: 9 }));

    const multi = renderHook(() =>
      useLocalStorageMulti<{ a: number; b: number }>(multiKeys, multiStorageOptions),
    );
    act(() => multi.result.current.setValue("a", 1));
    act(() => multi.result.current.setValues({ b: 2 }));
    act(() => multi.result.current.removeValue("a"));
    act(() => multi.result.current.removeAll());
    act(() => multi.result.current.clearErrors());

    sessionStorage.setItem("s1", JSON.stringify("hi"));
    const ss = renderHook(() => useSessionStorage<string>("s1"));
    expect(ss.result.current[0]).toBe("hi");
    act(() => ss.result.current[1]("bye"));
    act(() => ss.result.current[2]());
  });

  test("useAsyncState and useAsyncStates", async () => {
    const { useAsyncState, useAsyncStates } = await import("@/hooks/useAsyncState");
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();

    const { result, unmount } = renderHook(() =>
      useAsyncState<number>({ initialData: 0, onSuccess, onError, onSettled }),
    );

    await act(async () => {
      const data = await result.current[1].execute(async () => 42);
      expect(data).toBe(42);
    });
    expect(onSuccess).toHaveBeenCalled();

    act(() => result.current[1].setData(99));
    act(() => result.current[1].setError(new Error("x")));
    act(() => result.current[1].reset());

    await act(async () => {
      await expect(
        result.current[1].execute(async () => {
          throw "fail";
        }),
      ).rejects.toBeInstanceOf(Error);
    });

    unmount();

    const multi = renderHook(() =>
      useAsyncStates<{ a: number }>({ a: 1 }),
    );
    await act(async () => {
      await multi.result.current.execute("a", async () => 5);
    });
    act(() => multi.result.current.setData("a", 6));
    act(() => multi.result.current.setError("a", new Error("e")));
    act(() => multi.result.current.reset("a"));
    act(() => multi.result.current.resetAll());
  });

  test("useIntersectionObserver observes elements", async () => {
    installIntersectionObserverMock();
    const { useIntersectionObserver } = await import("@/hooks/useIntersectionObserver");

    const el = document.createElement("div");
    document.body.appendChild(el);

    const single = renderHook(() =>
      useIntersectionObserver({ freezeOnceVisible: true }),
    );
    act(() => single.result.current[0](el));
    expect(single.result.current[1]?.isIntersecting).toBe(true);
  });
});
