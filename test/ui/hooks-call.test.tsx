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
    // Restore real timers here rather than at the end of each fake-timer
    // test body: a mid-test assertion failure would otherwise skip the
    // restore and leak fake timers into every later test in the file.
    vi.useRealTimers();
  });

  test("useCallState enforces state machine transitions", async () => {
    const { useCallState } = await import("@/hooks/call/useCallState");
    const { result } = renderHook(() => useCallState());

    expect(result.current.state).toBe("idle");
    // Invalid from idle — stays idle.
    act(() => result.current.send({ type: "CONNECT" }));
    expect(result.current.state).toBe("idle");

    act(() => result.current.send({ type: "START_DIALING" }));
    expect(result.current.state).toBe("dialing");
    act(() => result.current.send({ type: "CONNECT" }));
    expect(result.current.state).toBe("connected");
    act(() => result.current.send({ type: "HANG_UP" }));
    expect(result.current.state).toBe("completed");
    act(() => result.current.send({ type: "NEXT" }));
    expect(result.current.state).toBe("idle");

    act(() => result.current.send({ type: "START_DIALING" }));
    act(() => result.current.send({ type: "FAIL" }));
    expect(result.current.state).toBe("failed");
    act(() => result.current.send({ type: "NEXT" }));
    expect(result.current.state).toBe("idle");
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

    // Poll-until rather than a fixed sleep: a 150ms wait on a 100ms interval
    // left a 50ms scheduling margin, which is exactly the kind of budget a
    // loaded fork-pool CI worker blows through.
    await vi.waitFor(
      () => expect(onStatus).toHaveBeenCalledWith("in-progress", undefined),
      { timeout: 2000 },
    );
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

  test("useTwilioConnection register() rejecting with undefined does not throw and surfaces a fallback error", async () => {
    // Regression test for the handset crash (audit-C P2): Twilio's Voice SDK
    // can reject device.register() with `undefined` instead of an Error for
    // signaling-level auth failures. The old `(err: Error) => ... err.message`
    // handler chain crashed with "Cannot read properties of undefined
    // (reading 'message')"; useTwilioConnection.ts must normalize the
    // rejection to a real Error before it reaches any downstream onError.
    const { useTwilioConnection } = await import("@/hooks/call/useTwilioConnection");
    const onError = vi.fn();

    mockTwilioDevice.register.mockImplementationOnce(() => Promise.reject(undefined));

    expect(() => {
      renderHook(() => useTwilioConnection({ token: "tok", onError }));
    }).not.toThrow();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const receivedError = onError.mock.calls[0]?.[0];
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError?.message).toBeTruthy();
  });

  test("useSoftphoneController's onError wiring survives an undefined/messageless connection error", async () => {
    // Defense-in-depth companion to the useTwilioConnection regression test
    // above: even if some future caller passes an err without a `.message`
    // straight to useSoftphoneController's onError wiring, it must not throw.
    const { useSoftphoneController } = await import(
      "@/hooks/call/useSoftphoneController"
    );
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useSoftphoneController({
        token: "tok",
        workspaceId: "ws",
        clientIdentity: "agent-1",
        endSession: vi.fn(),
        onNavigateBack: vi.fn(),
        onError,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(() => {
      act(() => mockTwilioDevice.emit("error", undefined));
    }).not.toThrow();
    expect(onError).toHaveBeenCalled();
    expect(typeof onError.mock.calls.at(-1)?.[0]).toBe("string");
    expect(result.current.connection).toBeTruthy();
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

  // Regression: useTwilioDevice keeps its own `error` state (set via the
  // onError callback from useTwilioConnection) separate from the
  // connection's internal error — clearing one without the other still left
  // the call screen's banner (which reads useTwilioDevice's error) stuck.
  test("useTwilioDevice clears its own error state on the next successful registration, and exposes reconnect", async () => {
    const { useTwilioDevice } = await import("@/hooks/call/useTwilioDevice");
    const send = vi.fn();

    const { result } = renderHook(() =>
      useTwilioDevice("tok", "computer", "ws", send),
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => mockTwilioDevice.emit("error", new Error("device down")));
    expect(result.current.error?.message).toBe("device down");

    act(() => mockTwilioDevice.emit("registered"));
    expect(result.current.error).toBeNull();

    expect(typeof result.current.reconnect).toBe("function");
  });

  test("autoAcceptIncoming accepts client-ringed outbound legs and never surfaces the incoming box", async () => {
    const { useCallHandling } = await import("@/hooks/call/useCallHandling");

    const { result } = renderHook(() =>
      useCallHandling({
        device: mockTwilioDevice as any,
        workspaceId: "ws",
        autoAcceptIncoming: true,
      }),
    );

    const incoming = createMockTwilioCall({
      parameters: { CallSid: "CA-auto", To: "client:u" },
    });
    act(() => result.current.receiveIncoming(incoming));
    expect(incoming.accept).toHaveBeenCalledTimes(1);
    expect(result.current.activeCall).toBe(incoming);
    expect(result.current.incomingCall).toBeNull();
    expect(result.current.callState).toBe("connected");

    const nonClient = createMockTwilioCall({
      parameters: { CallSid: "CA-sip", To: "sip:x" },
    });
    act(() => result.current.receiveIncoming(nonClient));
    expect(nonClient.accept).not.toHaveBeenCalled();
    expect(result.current.incomingCall).toBe(nonClient);
  });

  test("useTwilioDevice auto-answers client-ringed outbound legs (no incoming box)", async () => {
    const { useTwilioDevice } = await import("@/hooks/call/useTwilioDevice");
    const send = vi.fn();

    const { result } = renderHook(() =>
      useTwilioDevice("tok", "computer", "ws", send),
    );

    await act(async () => {
      await mockTwilioDevice.register();
    });

    const incoming = createMockTwilioCall({
      parameters: { CallSid: "CA-dial", To: "client:u" },
    });
    act(() => mockTwilioDevice.emit("incoming", incoming));
    expect(incoming.accept).toHaveBeenCalledTimes(1);
    expect(result.current.activeCall).toBe(incoming);
    expect(result.current.incomingCall).toBeNull();
    // Campaign outbound auto-accept no longer dispatches CONNECT — the
    // customer-leg in-progress callback is the only signal that advances
    // the FSM from dialing to connected.
    expect(send).not.toHaveBeenCalledWith({ type: "CONNECT" });
  });
});
