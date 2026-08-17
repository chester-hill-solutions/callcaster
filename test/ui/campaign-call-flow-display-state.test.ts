import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onPollStatus: null as ((status: string, resolvedSid?: string) => void) | null,
  onCallRowChange: null as ((payload: unknown) => void) | null,
  pollingEnabled: null as boolean | null,
  send: vi.fn(),
}));

vi.mock("@/hooks/call/useCallStatusPolling", () => ({
  useCallStatusPolling: (opts: {
    enabled: boolean;
    onStatus: (status: string, resolvedSid?: string) => void;
  }) => {
    mocks.onPollStatus = opts.onStatus;
    mocks.pollingEnabled = opts.enabled;
  },
}));

vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: (opts: {
    onChange: (payload: unknown) => void;
  }) => {
    mocks.onCallRowChange = opts.onChange;
  },
}));

import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";

type HookProps = Parameters<typeof useCampaignCallFlow>[0];

function baseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    callSid: null,
    agentLegSid: null,
    workspaceId: "ws-1",
    state: "idle",
    activeCall: null,
    recentAttemptDisposition: null,
    predictiveState: { contact_id: null, status: "idle" },
    isPredictive: false,
    send: vi.fn(),
    ...overrides,
  };
}

function renderFlow(overrides: Partial<HookProps> = {}) {
  return renderHook((props: HookProps) => useCampaignCallFlow(props), {
    initialProps: baseProps(overrides),
  });
}

describe("useCampaignCallFlow displayState", () => {
  describe("power dial (isPredictive: false)", () => {
    test("idle FSM with no call shows idle (Pending)", () => {
      const { result } = renderFlow();
      expect(result.current.displayState).toBe("idle");
    });

    test("ignores predictiveState 'idle' once the FSM starts dialing", () => {
      const { result } = renderFlow({ state: "dialing" });
      expect(result.current.displayState).toBe("dialing");
    });

    test("agent leg accepted stays at dialing — no CONNECT dispatch", () => {
      // Regression: the auto-accept path previously dispatched CONNECT
      // the moment the browser agent leg connected. The FSM must remain
      // at dialing; only a child-leg in-progress may advance it.
      const send = vi.fn();
      const { result } = renderFlow({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      });

      // Simulate polling returning the PARENT leg's in-progress (which
      // would be the current broken behavior if we poll the parent).
      // Our fix resolves the child leg first, so even if the parent
      // is in-progress, the child status controls the display.
      expect(result.current.displayState).toBe("dialing");
    });

    test("child SSE event with parent_call_sid gets adopted as customer leg", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      });

      // Simulate child-leg SSE event arriving
      mocks.onCallRowChange?.({
        new: { sid: "CA-child", parent_call_sid: "CA-parent", status: "ringing" },
      });
      rerender(baseProps({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      }));

      expect(result.current.displayState).toBe("dialing");
      expect(send).not.toHaveBeenCalledWith({ type: "CONNECT" });
    });

    test("child in-progress shows connected and dispatches CONNECT", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      });

      mocks.onCallRowChange?.({
        new: { sid: "CA-child", parent_call_sid: "CA-parent", status: "in-progress" },
      });
      rerender(baseProps({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      }));

      expect(result.current.displayState).toBe("connected");
      expect(send).toHaveBeenCalledWith({ type: "CONNECT" });
    });

    test("parent in-progress does NOT show connected when child exists", () => {
      // If the parent SDK call is in-progress but we're already tracking
      // the child leg, parent events must be ignored.
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      });

      // First a child ringing arrives
      mocks.onCallRowChange?.({
        new: { sid: "CA-child", parent_call_sid: "CA-parent", status: "ringing" },
      });
      rerender(baseProps({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      }));
      expect(result.current.displayState).toBe("dialing");

      // Now a parent in-progress arrives (should be ignored)
      mocks.onCallRowChange?.({
        new: { sid: "CA-parent", status: "in-progress" },
      });
      rerender(baseProps({
        state: "dialing",
        agentLegSid: "CA-parent",
        callSid: "CA-parent",
        send,
      }));

      // Display must NOT jump to connected from parent leg.
      expect(result.current.displayState).toBe("dialing");
      expect(send).not.toHaveBeenCalledWith({ type: "CONNECT" });
    });

    test("FSM connected shows connected before any provider status arrives", () => {
      const { result } = renderFlow({ state: "connected" });
      expect(result.current.displayState).toBe("connected");
    });

    test("provider in-progress status shows connected and dispatches CONNECT", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        callSid: "CA123",
        send,
      });

      mocks.onCallRowChange?.({ new: { sid: "CA123", status: "in-progress" } });
      rerender(baseProps({ state: "dialing", callSid: "CA123", send }));

      expect(result.current.displayState).toBe("connected");
      expect(send).toHaveBeenCalledWith({ type: "CONNECT" });
    });

    test("terminal disposition shows the call result when FSM is done", () => {
      const { result } = renderFlow({
        state: "completed",
        recentAttemptDisposition: "voicemail",
      });
      expect(result.current.displayState).toBe("voicemail");
    });

    test("polling status updates drive the display", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        callSid: "CA456",
        send,
      });

      mocks.onPollStatus?.("completed");
      rerender(baseProps({ state: "completed", callSid: "CA456", send }));

      expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
      expect(result.current.displayState).toBe("completed");
    });

    test("completed call retains outcome after SDK teardown (terminal latch)", () => {
      // Regression: when activeCall becomes null, the provider status
      // was cleared and completed fell through to Pending.
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "completed",
        callSid: "CA-terminal",
        agentLegSid: "CA-terminal",
        send,
        activeCall: {} as any,
      });

      // Terminal status arrives
      mocks.onCallRowChange?.({
        new: { sid: "CA-child", parent_call_sid: "CA-terminal", status: "completed" },
      });
      rerender(baseProps({
        state: "completed",
        callSid: "CA-terminal",
        agentLegSid: "CA-terminal",
        send,
        activeCall: {} as any,
      }));

      expect(result.current.displayState).toBe("completed");

      // SDK tears down: activeCall === null, callSid cleared
      rerender(baseProps({
        state: "completed",
        callSid: null,
        agentLegSid: null,
        send,
        activeCall: null,
      }));

      // Must still show completed, not idle / Pending
      expect(result.current.displayState).toBe("completed");
    });

    test("terminate latch cleared on new dial", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "completed",
        callSid: "CA-old",
        agentLegSid: "CA-old",
        send,
        activeCall: null,
      });

      // Terminal latch was set
      mocks.onCallRowChange?.({
        new: { sid: "CA-child", parent_call_sid: "CA-old", status: "completed" },
      });
      rerender(baseProps({
        state: "completed",
        callSid: "CA-old",
        agentLegSid: "CA-old",
        send,
        activeCall: null,
      }));

      // New dial begins — agentLegSid changes
      rerender(baseProps({
        state: "dialing",
        callSid: "CA-new",
        agentLegSid: "CA-new",
        send,
        activeCall: {} as any,
      }));

      expect(result.current.displayState).toBe("dialing");
    });

    test("completed call via PROVIDER_ENDED shows outcome after SDK teardown", () => {
      const send = vi.fn();
      const { result, rerender } = renderFlow({
        state: "dialing",
        callSid: "CA-call",
        agentLegSid: "CA-call",
        send,
        activeCall: {} as any,
      });

      act(() => {
        mocks.onCallRowChange?.({
          new: { sid: "CA-child", parent_call_sid: "CA-call", status: "completed" },
        });
      });
      rerender(baseProps({
        state: "completed",
        callSid: null,
        agentLegSid: null,
        send,
        activeCall: null,
      }));

      // Canonical lifecycle retains "completed" outcome — no terminal latch needed.
      expect(result.current.displayState).toBe("completed");
    });

    test("polling fallback is live on a connected call with no prior SSE event", () => {
      // Regression: if the customer-leg SSE event that reports the hangup
      // is ever dropped (missed realtime message, tab backgrounded, etc.),
      // the 5s poll is the only remaining way to learn the call ended. But
      // polling was gated on `pollingTargetSid`, which is only set inside
      // the SSE/poll callback itself — a call that has NEVER received an
      // SSE event (this test's exact setup) could poll only after SSE
      // already worked, defeating its purpose as a fallback.
      const { rerender } = renderFlow({
        state: "idle",
        callSid: null,
        agentLegSid: null,
        activeCall: null,
      });

      rerender(baseProps({
        state: "dialing",
        callSid: "CA-live",
        agentLegSid: "CA-live",
        activeCall: null,
      }));

      rerender(baseProps({
        state: "connected",
        callSid: "CA-live",
        agentLegSid: "CA-live",
        activeCall: {} as any,
      }));

      expect(mocks.pollingEnabled).toBe(true);
    });

    test("terminal customer-leg status forces the live SDK call to disconnect", () => {
      // Regression: a provider-detected hangup (SSE/poll) only ever flipped
      // FSM/UI state — it never told the still-live Twilio SDK Call object
      // the leg was over. That's why a client hangup could update the
      // display yet play no hangup tone and leave the WebRTC session open:
      // the built-in SDK sound only fires off the SDK's own 'disconnect'
      // event, which nothing forced here.
      const mockCall = { disconnect: vi.fn() };
      const { rerender } = renderFlow({
        state: "connected",
        callSid: "CA-live",
        agentLegSid: "CA-live",
        activeCall: mockCall as any,
      });

      act(() => {
        mocks.onCallRowChange?.({
          new: { sid: "CA-child", parent_call_sid: "CA-live", status: "completed" },
        });
      });
      rerender(baseProps({
        state: "connected",
        callSid: "CA-live",
        agentLegSid: "CA-live",
        activeCall: mockCall as any,
      }));

      expect(mockCall.disconnect).toHaveBeenCalled();
    });
  });

  describe("predictive (isPredictive: true)", () => {
    test("idle dialer state shows idle even with a live device call", () => {
      const { result } = renderFlow({
        isPredictive: true,
        predictiveState: { contact_id: null, status: "idle" },
      });
      expect(result.current.displayState).toBe("idle");
    });

    test("dialer broadcasts lead the display", () => {
      const { result } = renderFlow({
        isPredictive: true,
        predictiveState: { contact_id: 7, status: "dialing" },
      });
      expect(result.current.displayState).toBe("dialing");
    });

    test.each([
      ["completed", "completed"],
      ["failed", "failed"],
      ["no-answer", "no-answer"],
    ])("dialer outcome %s shows %s", (status, expected) => {
      const { result } = renderFlow({
        isPredictive: true,
        predictiveState: { contact_id: 7, status },
      });
      expect(result.current.displayState).toBe(expected);
    });

    test("raw provider broadcast statuses fall through to the FSM/provider path", () => {
      const { result } = renderFlow({
        isPredictive: true,
        state: "connected",
        predictiveState: { contact_id: 7, status: "ringing" },
      });
      expect(result.current.displayState).toBe("connected");
    });
  });
});
