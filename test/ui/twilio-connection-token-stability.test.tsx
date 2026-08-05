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
