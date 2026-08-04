import { beforeEach, describe, expect, test, vi } from "vitest";
import { isRetryableTwilioError } from "@/lib/twilio-errors";
import {
  attachChannelSenderToMessagingService,
  listMessagingServiceChannelSenders,
  withTwilioRetry,
} from "@/lib/twilio-client.server";
import type Twilio from "twilio";

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

describe("ChannelSenders (RCS sender-pool attach) client wrappers", () => {
  function fakeTwilioClient(overrides: {
    create?: (params: { sid: string }) => Promise<unknown>;
    list?: (params: unknown) => Promise<unknown[]>;
  }) {
    const create = overrides.create ?? vi.fn(async () => ({}));
    const list = overrides.list ?? vi.fn(async () => []);
    const services = vi.fn(() => ({
      channelSenders: { create, list },
    }));
    return {
      client: {
        messaging: { v1: { services } },
      } as unknown as Twilio.Twilio,
      services,
      create,
      list,
    };
  }

  test("attachChannelSenderToMessagingService calls create with the sender SID", async () => {
    const create = vi.fn(async () => ({ sid: "XEabc" }));
    const { client, services } = fakeTwilioClient({ create });

    const result = await attachChannelSenderToMessagingService(client, "MG123", "XEabc", {
      operation: "test",
    });

    expect(services).toHaveBeenCalledWith("MG123");
    expect(create).toHaveBeenCalledWith({ sid: "XEabc" });
    expect(result).toEqual({ sid: "XEabc" });
  });

  test("listMessagingServiceChannelSenders lists senders for the service", async () => {
    const list = vi.fn(async () => [{ sid: "XEabc" }, { sid: "XEdef" }]);
    const { client, services } = fakeTwilioClient({ list });

    const result = await listMessagingServiceChannelSenders(client, "MG123", {
      operation: "test",
    });

    expect(services).toHaveBeenCalledWith("MG123");
    expect(list).toHaveBeenCalledWith({ limit: 200 });
    expect(result).toEqual([{ sid: "XEabc" }, { sid: "XEdef" }]);
  });
});
