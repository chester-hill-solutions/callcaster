import { beforeEach, describe, expect, test, vi } from "vitest";
import { isRetryableTwilioError } from "@/lib/twilio-errors";
import { withTwilioRetry } from "@/lib/twilio-client.server";

describe("withTwilioRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("retries on 429 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, message: "rate limit" })
      .mockResolvedValueOnce("ok");

    const promise = withTwilioRetry(fn, {
      operation: "test",
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 400", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400, message: "bad" });
    await expect(
      withTwilioRetry(fn, { operation: "test", maxAttempts: 3, baseDelayMs: 10 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("isRetryableTwilioError aligns with client", () => {
    expect(isRetryableTwilioError({ status: 503 })).toBe(true);
    expect(isRetryableTwilioError({ status: 404 })).toBe(false);
  });
});
