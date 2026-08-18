import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@twilio/voice-sdk", async () => {
  return await import("../mocks/twilio-voice-sdk");
});

import { mockTwilioDevice, resetTwilioVoiceSdkMock } from "../mocks/twilio-voice-sdk";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";

// Regression: the call-screen loader re-mints the Twilio JWT on every
// revalidation (every fetcher submit), and the old effect was keyed on the
// token — so typing a script answer rebuilt the entire Device, mid-call.
describe("useTwilioConnection token stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
  });

  test("a new token updates the existing device in place — no rebuild", async () => {
    const { rerender } = renderHook(
      ({ token }: { token: string }) => useTwilioConnection({ token }),
      { initialProps: { token: "tok-1" } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);

    rerender({ token: "tok-2" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockTwilioDevice.updateToken).toHaveBeenCalledWith("tok-2");
    // Still the original device: registered exactly once, never destroyed.
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);
    expect(mockTwilioDevice.destroy).not.toHaveBeenCalled();
  });

  test("unmount destroys the device (closes the signalling socket)", async () => {
    const { unmount } = renderHook(() => useTwilioConnection({ token: "tok-1" }));

    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
  });

  test("device is exposed as state once created", async () => {
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.device).toBe(mockTwilioDevice as never);
    expect(result.current.isRegistered).toBe(true);
  });
});

// Regression: terminal Device states (Error/RegistrationFailed/Unregistered)
// were absorbing — nothing retried registration, and the dial button was
// hard-gated on status === "Registered", so a page reload was the only way
// back. reconnect() gives the agent a manual recovery path.
describe("useTwilioConnection error recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
  });

  test("a successful registration after an error clears the error state", async () => {
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockTwilioDevice.emit("error", new Error("boom"));
    });
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.status).toBe("Error");

    act(() => {
      mockTwilioDevice.emit("registered");
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("Registered");
  });

  test("reconnect() destroys the stale device and creates+registers a new one", async () => {
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);

    mockTwilioDevice.emit("error", new Error("boom"));
    act(() => {
      result.current.reconnect();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(2);
  });

  test("reconnect() clears error and resets status immediately, not only after re-registering", async () => {
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      mockTwilioDevice.emit("error", new Error("boom"));
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reconnect();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("disconnected");
  });
});


// #1294: a mid-call RateExceededError (31206) was fast-retried on the 2s
// backoff — straight back into the rate limit — and the retry's reconnect()
// destroyed the device with the agent's LIVE call still on it. destroy()'s
// hangup publish then threw over the dead transport, orphaning the call's
// ICE-restart loop (endless 31009 spam after hangup, feeding the same rate
// limit). These pin the storm-breaking behaviors.
describe("useTwilioConnection reconnect storm (#1294)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
    mockTwilioDevice.calls = [];
  });

  function rateError(code: number, message: string) {
    return Object.assign(new Error(message), { code });
  }

  test("31206 cools down for 60s instead of the 2s fast retry", async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useTwilioConnection({ token: "tok-1" }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);

      act(() => {
        mockTwilioDevice.emit("error", rateError(31206, "rate exceeded"));
      });

      // The old 2s fast path must NOT fire.
      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(mockTwilioDevice.destroy).not.toHaveBeenCalled();

      // After the full cooldown the rebuild happens.
      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
      expect(mockTwilioDevice.register).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a retry timer firing mid-call defers instead of destroying the live call", async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useTwilioConnection({ token: "tok-1" }));
      await act(async () => {
        await Promise.resolve();
      });

      // A live call is on the device when the error fires and stays live
      // through the first timer.
      mockTwilioDevice.calls = [{ disconnect: vi.fn() }];
      act(() => {
        mockTwilioDevice.emit("error", rateError(99999, "some device error"));
      });

      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
      });
      // Deferred: no rebuild while the call is live.
      expect(mockTwilioDevice.destroy).not.toHaveBeenCalled();

      // Call ends; the deferred timer fires and the rebuild proceeds.
      mockTwilioDevice.calls = [];
      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
      });
      expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("31009 mid-call defers the rebuild instead of killing the call", async () => {
    renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => {
      await Promise.resolve();
    });

    mockTwilioDevice.calls = [{ disconnect: vi.fn() }];
    act(() => {
      mockTwilioDevice.emit("error", rateError(31009, "no transport"));
    });

    // No immediate rebuild with a live call on the device.
    expect(mockTwilioDevice.destroy).not.toHaveBeenCalled();
  });

  test("reconnect() disconnects every stale call, isolating dead-transport throws", async () => {
    const throwing = {
      disconnect: vi.fn(() => {
        throw Object.assign(new Error("no transport"), { code: 31009 });
      }),
    };
    const healthy = { disconnect: vi.fn() };
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => {
      await Promise.resolve();
    });

    mockTwilioDevice.calls = [throwing, healthy];
    act(() => {
      result.current.reconnect();
    });

    // The first call's throw must not stop the second disconnect or destroy.
    expect(throwing.disconnect).toHaveBeenCalledTimes(1);
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
    expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
  });
});
