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


describe("useTwilioConnection teardown (#2706)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
    mockTwilioDevice.calls = [];
  });

  test("unmount disconnects app-owned held calls absent from Device.calls", async () => {
    const held = { disconnect: vi.fn() };
    const { unmount } = renderHook(() => useTwilioConnection({
      token: "tok-1", getOwnedCalls: () => [held as never],
    }));
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(held.disconnect).toHaveBeenCalledTimes(1);
    expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
  });

  test("reconnect does not register a replacement when SDK destruction fails", async () => {
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
    await act(async () => { await Promise.resolve(); });
    mockTwilioDevice.destroy.mockImplementationOnce(() => { throw new Error("Unexpected SDK exception"); });
    act(() => result.current.reconnect());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe("Error");
    expect(result.current.error?.message).toMatch(/cleanup did not finish/i);
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);
  });

  test("reconnect stops when an app-owned call cannot disconnect even if Device.destroy returns", async () => {
    const held = { on: vi.fn(), removeAllListeners: vi.fn(), disconnect: vi.fn(() => { throw new Error("Unexpected held call exception"); }) };
    const { result } = renderHook(() => useTwilioConnection({ token: "tok-1", getOwnedCalls: () => [held as never] }));
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.reconnect());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe("Error");
    expect(result.current.error?.message).toMatch(/cleanup did not finish/i);
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);
    held.disconnect.mockImplementation(() => {});
    act(() => result.current.reconnect());
    await act(async () => { await Promise.resolve(); });
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(2);
  });

  test("transport recovery waits for an app-owned active leg absent from Device.calls", async () => {
    vi.useFakeTimers();
    let ownedCalls: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [{ disconnect: vi.fn() }];
    try {
      const { unmount } = renderHook(() => useTwilioConnection({ token: "tok-1", getOwnedCalls: () => ownedCalls as never[] }));
      await act(async () => { await Promise.resolve(); });
      act(() => mockTwilioDevice.emit("error", Object.assign(new Error("transport unavailable"), { code: 31009 })));
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(mockTwilioDevice.destroy).not.toHaveBeenCalled();
      ownedCalls = [];
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(mockTwilioDevice.destroy).toHaveBeenCalledTimes(1);
      expect(mockTwilioDevice.register).toHaveBeenCalledTimes(2);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  test("late registration rejection after exit cannot report errors or start retries", async () => {
    let reject!: (error: Error) => void;
    mockTwilioDevice.register.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const onError = vi.fn();
    const { unmount } = renderHook(() => useTwilioConnection({ token: "tok-1", onError }));
    await act(async () => { await Promise.resolve(); });
    unmount();
    await act(async () => { reject(new Error("Registration completed after exit")); });
    expect(onError).not.toHaveBeenCalled();
    expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);
  });

  test("unmount cancels all retries after repeated device errors", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => useTwilioConnection({ token: "tok-1" }));
      await act(async () => { await Promise.resolve(); });
      act(() => {
        mockTwilioDevice.emit("error", new Error("First error"));
        mockTwilioDevice.emit("error", new Error("Second error"));
      });
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(mockTwilioDevice.register).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
