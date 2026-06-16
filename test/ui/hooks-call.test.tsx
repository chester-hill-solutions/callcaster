import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockTwilioCall } from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@twilio/voice-sdk", async () => {
  return await import("../mocks/twilio-voice-sdk");
});

import { mockTwilioDevice, resetTwilioVoiceSdkMock } from "../mocks/twilio-voice-sdk";

vi.mock("@/lib/services/hooks-api", () => ({
  hangupCall: vi.fn().mockResolvedValue(undefined),
  startConferenceAndDial: vi.fn(),
}));

describe("call hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "in-progress" }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("useCallState state machine and timer", async () => {
    vi.useFakeTimers();
    const { useCallState } = await import("@/hooks/call/useCallState");
    const { result } = renderHook(() => useCallState());

    act(() => result.current.send({ type: "CONNECT" }));
    act(() => result.current.send({ type: "START_DIALING" }));
    act(() => result.current.send({ type: "CONNECT" }));
    act(() => result.current.send({ type: "SET_DISPOSITION", disposition: "yes" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.context.callDuration).toBeGreaterThan(0);
    act(() => result.current.send({ type: "HANG_UP" }));
    act(() => result.current.send({ type: "NEXT" }));
    act(() => result.current.send({ type: "FAIL" }));
    act(() => result.current.send({ type: "START_DIALING" }));
    act(() => result.current.send({ type: "NEXT" }));
    vi.useRealTimers();
  });

  test("useCallDuration tracks connected state", async () => {
    vi.useFakeTimers();
    const { useCallDuration } = await import("@/hooks/call/useCallDuration");
    const { result, rerender } = renderHook(
      ({ state }) => useCallDuration(state),
      { initialProps: { state: "idle" } },
    );

    rerender({ state: "connected" });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.callDuration).toBeGreaterThan(0);
    rerender({ state: "idle" });
    expect(result.current.callDuration).toBe(0);
    vi.useRealTimers();
  });

  test("useCallStatusPolling polls when enabled", async () => {
    const { useCallStatusPolling } = await import("@/hooks/call/useCallStatusPolling");
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

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(onStatus).toHaveBeenCalledWith("in-progress");
  });

  test("useStartConferenceAndDial begin paths", async () => {
    const api = await import("@/lib/services/hooks-api");
    const { useStartConferenceAndDial } = await import(
      "@/hooks/call/useStartConferenceAndDial"
    );

    vi.mocked(api.startConferenceAndDial).mockResolvedValueOnce({
      success: true,
      conferenceName: "conf",
    } as any);

    const ok = renderHook(() =>
      useStartConferenceAndDial({
        userId: "u",
        campaignId: "c",
        workspaceId: "w",
        callerId: "cid",
        selectedDevice: "d",
      }),
    );
    await act(async () => {
      await ok.result.current.begin();
    });
    expect(ok.result.current.conference).toBe("conf");

    vi.mocked(api.startConferenceAndDial).mockResolvedValueOnce({
      creditsError: true,
    } as any);
    await act(async () => {
      await ok.result.current.begin();
    });
    expect(ok.result.current.creditsError).toBe(true);

    const bad = renderHook(() =>
      useStartConferenceAndDial({
        userId: "",
        campaignId: "c",
        workspaceId: "w",
        callerId: "cid",
        selectedDevice: "d",
      }),
    );
    await act(async () => {
      await bad.result.current.begin();
    });
    expect(bad.result.current.error).toBeTruthy();
  });

  test("useTwilioConnection registers device and handles events", async () => {
    const { useTwilioConnection } = await import("@/hooks/call/useTwilioConnection");
    const onIncoming = vi.fn();

    const { result } = renderHook(() =>
      useTwilioConnection({
        token: "tok",
        onIncomingCall: onIncoming,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    act(() => mockTwilioDevice.emit("incoming", createMockTwilioCall()));
    expect(onIncoming).toHaveBeenCalled();
    act(() => mockTwilioDevice.emit("error", new Error("dev")));
    expect(result.current.error).toBeTruthy();

    const noToken = renderHook(() => useTwilioConnection({ token: "" }));
    expect(noToken.result.current.error?.message).toMatch(/token/i);
  });

  test("useCallHandling call lifecycle", async () => {
    const { useCallHandling } = await import("@/hooks/call/useCallHandling");
    const { hangupCall } = await import("@/lib/services/hooks-api");

    const incoming = createMockTwilioCall({ parameters: { CallSid: "CA-in", To: "client:u" } });

    const { result, rerender } = renderHook(
      (props: { incoming: ReturnType<typeof createMockTwilioCall> | null }) =>
        useCallHandling({
          device: mockTwilioDevice as any,
          workspaceId: "ws",
          incomingCall: props.incoming,
          autoAcceptIncoming: true,
        }),
      { initialProps: { incoming } },
    );

    await act(async () => {
      result.current.makeCall({ To: "+15551234567" });
      await Promise.resolve();
    });
    expect(result.current.activeCall).toBeTruthy();

    const nextIncoming = createMockTwilioCall({ parameters: { CallSid: "CA2", To: "sip:x" } });
    rerender({ incoming: nextIncoming });
    act(() => nextIncoming.emit("accept"));

    await act(async () => {
      await result.current.hangUp();
    });

    vi.mocked(hangupCall).mockRejectedValueOnce(
      new Error("Call is not in-progress. Cannot redirect."),
    );
    const active = createMockTwilioCall({ parameters: { CallSid: "CA-active" } });
    act(() => result.current.setActiveCall(active));
    await act(async () => {
      await result.current.hangUp(active);
    });

    act(() => result.current.answer());
    act(() => result.current.holdAndAnswer());
    act(() => {
      result.current.switchTo(createMockTwilioCall({ parameters: { CallSid: "held" } }));
    });

    const noDevice = renderHook(() =>
      useCallHandling({ device: null, workspaceId: "ws", incomingCall: null }),
    );
    act(() => noDevice.result.current.makeCall({ To: "+1" }));
    await act(async () => noDevice.result.current.hangUp());
    act(() => noDevice.result.current.answer());
  });

  test("mic mute does not set hold; resume respects mic state", async () => {
    const { useCallHandling } = await import("@/hooks/call/useCallHandling");
    const active = createMockTwilioCall({ parameters: { CallSid: "CA-mic-hold" } });

    const { result } = renderHook(() =>
      useCallHandling({ device: mockTwilioDevice as any, workspaceId: "ws" }),
    );

    act(() => result.current.setActiveCall(active));

    act(() => result.current.setMicMuted(true));
    expect(result.current.isMicMuted).toBe(true);
    expect(result.current.isActiveCallOnLocalHold).toBe(false);
    expect(active.mute).toHaveBeenCalledWith(true);

    act(() => result.current.holdActiveCall());
    expect(result.current.isActiveCallOnLocalHold).toBe(true);
    expect(result.current.isMicMuted).toBe(true);

    act(() => result.current.setMicMuted(false));
    expect(result.current.isMicMuted).toBe(false);
    expect(result.current.isActiveCallOnLocalHold).toBe(true);
    expect(active.mute).toHaveBeenLastCalledWith(true);

    act(() => result.current.resumeActiveCall());
    expect(result.current.isActiveCallOnLocalHold).toBe(false);
    expect(active.mute).toHaveBeenLastCalledWith(false);

    act(() => result.current.setMicMuted(true));
    act(() => result.current.holdActiveCall());
    act(() => result.current.resumeActiveCall());
    expect(result.current.isMicMuted).toBe(true);
    expect(active.mute).toHaveBeenLastCalledWith(true);
  });

  test("clearIncomingCall clears incoming session", async () => {
    const { useCallHandling } = await import("@/hooks/call/useCallHandling");
    const incoming = createMockTwilioCall({ parameters: { CallSid: "CA-in" } });

    const { result } = renderHook(() =>
      useCallHandling({
        device: mockTwilioDevice as any,
        workspaceId: "ws",
        incomingCall: incoming,
      }),
    );

    expect(result.current.incomingCall).toBeTruthy();
    act(() => result.current.clearIncomingCall());
    expect(result.current.incomingCall).toBeNull();
  });

  test("useTwilioDevice wires connection and handling", async () => {
    const { useTwilioDevice } = await import("@/hooks/call/useTwilioDevice");
    const send = vi.fn();

    expect(() => useTwilioDevice("", "d", "ws", send)).toThrow();

    const { result } = renderHook(() =>
      useTwilioDevice("tok", "computer", "ws", send),
    );

    await act(async () => {
      await mockTwilioDevice.register();
    });

    await act(async () => {
      result.current.makeCall({ To: "+15551234567" });
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.hangUp();
    });
    act(() => result.current.answer());
    act(() => result.current.setCallDuration(3));
    act(() => result.current.setIsBusy(true));
    expect(result.current.deviceIsBusy).toBe(true);
  });
});
