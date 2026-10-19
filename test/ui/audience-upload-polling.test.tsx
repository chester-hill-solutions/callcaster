import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { pollAudienceUploadStatus } from "@/lib/audience-upload-polling.client";

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

const INTERVAL = 5000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const tick = (ms = INTERVAL) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms + 100);
  });

test("the first read runs immediately, then one read per interval", async () => {
  const read = vi.fn().mockResolvedValue(undefined);
  const stop = pollAudienceUploadStatus({ intervalMs: INTERVAL, read });

  await tick(0);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);

  await tick(INTERVAL);
  expect(read).toHaveBeenCalledTimes(2);

  await tick(INTERVAL);
  expect(read).toHaveBeenCalledTimes(3);

  stop();
  await tick(INTERVAL * 3);
  expect(read).toHaveBeenCalledTimes(3);
});

test("a slow read is not overlapped by the interval", async () => {
  const first = deferred<void>();
  const read = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue(undefined);
  pollAudienceUploadStatus({ intervalMs: INTERVAL, read });

  await tick(0);
  expect(read).toHaveBeenCalledTimes(1);

  await tick(INTERVAL * 4);
  expect(read).toHaveBeenCalledTimes(1);

  await act(async () => {
    first.resolve();
  });
  await tick(INTERVAL);
  expect(read).toHaveBeenCalledTimes(2);
});

test("stop aborts an in-flight read and no later read runs", async () => {
  const pending = deferred<void>();
  let signal: AbortSignal | undefined;
  const read = vi.fn().mockImplementation((s: AbortSignal) => {
    signal = s;
    return pending.promise;
  });
  const stop = pollAudienceUploadStatus({ intervalMs: INTERVAL, read });

  await tick(0);
  expect(read).toHaveBeenCalledTimes(1);

  stop();
  expect(signal?.aborted).toBe(true);

  await act(async () => {
    pending.resolve();
  });
  await tick(INTERVAL * 3);
  expect(read).toHaveBeenCalledTimes(1);
});

test("a read that throws ends the task", async () => {
  const read = vi.fn().mockRejectedValue(new Error("boom"));
  pollAudienceUploadStatus({ intervalMs: INTERVAL, read });

  await tick(0);
  expect(read).toHaveBeenCalledTimes(1);

  await tick(INTERVAL * 4);
  expect(read).toHaveBeenCalledTimes(1);
  expect(logger.error).toHaveBeenCalled();
});
