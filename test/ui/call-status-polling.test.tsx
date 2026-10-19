import { Suspense, startTransition, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({ logger }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });
const inProgress = () => jsonResponse({ status: "in-progress" });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const tick = (ms = 100) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

test("a read for the previous call cannot publish after the call changes", async () => {
  const first = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementation(async () => inProgress());
  vi.stubGlobal("fetch", fetcher);
  const onStatusA = vi.fn();
  const onStatusB = vi.fn();

  const h = renderHook(
    ({ callSid, onStatus }) =>
      useCallStatusPolling({
        callSid,
        workspaceId: "ws",
        enabled: true,
        intervalMs: 100,
        onStatus,
      }),
    { initialProps: { callSid: "CA1", onStatus: onStatusA } },
  );

  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toContain("callSid=CA1");

  h.rerender({ callSid: "CA2", onStatus: onStatusB });
  await act(async () => {
    first.resolve(jsonResponse({ status: "completed", callSid: "CA1" }));
  });
  await tick(300);

  expect(onStatusA).not.toHaveBeenCalled();
  expect(onStatusB).not.toHaveBeenCalledWith("completed", "CA1");
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain("callSid=CA2");
});

test("a terminal status ends the poll", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => jsonResponse({ status: "completed" }));
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    }),
  );

  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(onStatus).toHaveBeenCalledWith("completed", undefined);

  await tick(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("a slow read is not overlapped by the next interval tick", async () => {
  const first = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementation(async () => inProgress());
  vi.stubGlobal("fetch", fetcher);

  renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus: vi.fn(),
    }),
  );

  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);

  await tick(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);

  await act(async () => {
    first.resolve(inProgress());
  });
  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a transient read error keeps the poll running", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async () => inProgress());
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    }),
  );

  await tick(100);
  expect(onStatus).not.toHaveBeenCalled();
  expect(logger.debug).toHaveBeenCalled();

  await tick(200);
  expect(onStatus).toHaveBeenCalledWith("in-progress", undefined);
});

test("disabling stops the poll", async () => {
  const fetcher = vi.fn().mockImplementation(async () => inProgress());
  vi.stubGlobal("fetch", fetcher);

  const h = renderHook(
    ({ enabled }) =>
      useCallStatusPolling({
        callSid: "CA1",
        workspaceId: "ws",
        enabled,
        intervalMs: 100,
        onStatus: vi.fn(),
      }),
    { initialProps: { enabled: true } },
  );

  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);

  h.rerender({ enabled: false });
  await tick(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("unmount aborts an in-flight read and ignores a late result", async () => {
  const pending = deferred<Response>();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn().mockImplementation((_url, init) => {
    signal = init?.signal;
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  const h = renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    }),
  );

  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);

  h.unmount();
  expect(signal?.aborted).toBe(true);

  await act(async () => {
    pending.resolve(inProgress());
  });
  await tick(1000);
  expect(onStatus).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("an unknown provider status is ignored but the poll continues", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => jsonResponse({ status: "not-a-status" }));
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    }),
  );

  await tick(300);
  expect(onStatus).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.length).toBeGreaterThan(1);
});

test("a non-OK status response is retried, not published", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => jsonResponse({ error: "nope" }, 404));
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  renderHook(() =>
    useCallStatusPolling({
      callSid: "CA1",
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    }),
  );

  await tick(300);
  expect(onStatus).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.length).toBeGreaterThan(1);
});

test("a suspended call transition keeps the visible call polling", async () => {
  const suspend = new Promise<never>(() => {});
  const fetcher = vi.fn().mockImplementation(async () => inProgress());
  vi.stubGlobal("fetch", fetcher);
  const onStatus = vi.fn();

  function Fixture() {
    const [callSid, setCallSid] = useState("CA1");
    useCallStatusPolling({
      callSid,
      workspaceId: "ws",
      enabled: true,
      intervalMs: 100,
      onStatus,
    });
    if (callSid === "CA2") throw suspend;
    return (
      <button onClick={() => startTransition(() => setCallSid("CA2"))}>
        Switch
      </button>
    );
  }

  render(
    <Suspense fallback={<p>Loading</p>}>
      <Fixture />
    </Suspense>,
  );

  await tick(100);
  expect(onStatus).toHaveBeenCalledWith("in-progress", undefined);
  onStatus.mockClear();

  await act(async () => {
    fireEvent.click(screen.getByText("Switch"));
  });
  await tick(200);

  // The transition is suspended, so the visible call (CA1) keeps polling.
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain("callSid=CA1");
  expect(onStatus).toHaveBeenCalledWith("in-progress", undefined);
});
