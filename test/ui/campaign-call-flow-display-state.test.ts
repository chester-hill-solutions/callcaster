import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onPollStatus: null as ((status: string) => void) | null,
  onCallRowChange: null as ((payload: unknown) => void) | null,
}));

vi.mock("@/hooks/call/useCallStatusPolling", () => ({
  useCallStatusPolling: (opts: { onStatus: (status: string) => void }) => {
    mocks.onPollStatus = opts.onStatus;
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
      // Regression: predictiveState initializes to "idle" and never updates
      // outside predictive mode; it must not pin the screen on Pending.
      const { result } = renderFlow({ state: "dialing" });
      expect(result.current.displayState).toBe("dialing");
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
