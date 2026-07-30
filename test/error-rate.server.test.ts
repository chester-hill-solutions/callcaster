import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  recordServerError,
  resetErrorRateForTests,
  setErrorRateHandler,
} from "@/lib/error-rate.server";

describe("error rate window", () => {
  beforeEach(() => {
    resetErrorRateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetErrorRateForTests();
  });

  test("stays quiet below the threshold", () => {
    const handler = vi.fn();
    setErrorRateHandler(handler);

    for (let i = 0; i < 24; i++) recordServerError();

    expect(handler).not.toHaveBeenCalled();
  });

  test("fires once per window, not once per error past the threshold", () => {
    const handler = vi.fn();
    setErrorRateHandler(handler);

    // A burst of 100 errors is one incident, not 76 pages.
    for (let i = 0; i < 100; i++) recordServerError();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ count: 25 }),
    );
  });

  test("a later window can alert again", () => {
    const handler = vi.fn();
    setErrorRateHandler(handler);

    for (let i = 0; i < 25; i++) recordServerError();
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    for (let i = 0; i < 25; i++) recordServerError();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("a throwing handler cannot break the request that tripped it", () => {
    setErrorRateHandler(() => {
      throw new Error("alerting is down");
    });

    expect(() => {
      for (let i = 0; i < 25; i++) recordServerError();
    }).not.toThrow();
  });

  test("a rejecting async handler does not produce an unhandled rejection", async () => {
    setErrorRateHandler(() => Promise.reject(new Error("resend down")));

    for (let i = 0; i < 25; i++) recordServerError();
    await Promise.resolve();
  });
});
