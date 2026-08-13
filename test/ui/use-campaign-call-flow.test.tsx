import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";

const polling = vi.hoisted(() => ({
  onStatus: null as ((status: string) => void) | null,
}));

vi.mock("@/hooks/call/useCallStatusPolling", () => ({
  useCallStatusPolling: (options: { onStatus: (status: string) => void }) => {
    polling.onStatus = options.onStatus;
  },
}));

describe("useCampaignCallFlow", () => {
  test.each([
    ["ringing", "dialing", null],
    ["in-progress", "connected", "CONNECT"],
  ])(
    "tracks provider %s for display/FSM without changing campaign disposition",
    (providerStatus, displayState, expectedAction) => {
      const send = vi.fn();
      const { result } = renderHook(() => {
        const [disposition] = useState("campaign-success");
        const flow = useCampaignCallFlow({
          callSid: "CA1",
          workspaceId: "w1",
          state: "dialing",
          activeCall: null,
          recentAttemptDisposition: disposition,
          predictiveState: { status: "unknown", contact_id: null },
          isPredictive: false,
          send,
        });
        return { disposition, ...flow };
      });

      act(() => polling.onStatus?.(providerStatus));

      expect(result.current.disposition).toBe("campaign-success");
      expect(result.current.displayState).toBe(displayState);
      if (expectedAction) {
        expect(send).toHaveBeenCalledWith({ type: expectedAction });
      } else {
        expect(send).not.toHaveBeenCalled();
      }
    },
  );

  test("tracks provider completed for display via lifecycle reducer", () => {
    // The completed case is verified by the pure lifecycle reducer tests.
    // This integration test confirms the FSM action is dispatched.
    const send = vi.fn();
    renderHook(() => {
      useCampaignCallFlow({
        callSid: "CA1",
        workspaceId: "w1",
        state: "dialing",
        activeCall: null,
        recentAttemptDisposition: null,
        predictiveState: { status: "unknown", contact_id: null },
        isPredictive: false,
        send,
      });
    });

    act(() => polling.onStatus?.("completed"));
    expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
  });

  function renderFlow(initialState: string) {
    const send = vi.fn();
    const view = renderHook(
      ({ state }: { state: string }) =>
        useCampaignCallFlow({
          callSid: "CA1",
          agentLegSid: null,
          workspaceId: "w1",
          state,
          activeCall: null,
          recentAttemptDisposition: null,
          predictiveState: { status: "unknown", contact_id: null },
          isPredictive: false,
          send,
        }),
      { initialProps: { state: initialState } },
    );
    return { ...view, send };
  }

  // Regression #1220: the previous call's terminal outcome flashed (or, with
  // no browser leg SID, stuck) at the top of the screen when a new dial began.
  test("a new dial immediately clears the previous call's terminal display", () => {
    const { result, rerender } = renderFlow("dialing");

    act(() => polling.onStatus?.("completed"));
    rerender({ state: "completed" });
    expect(result.current.displayState).toBe("completed");

    // New dial: FSM goes dialing before any new leg SID exists (phone-as-
    // device never gets one). The old outcome must not survive the gap.
    rerender({ state: "dialing" });
    expect(result.current.displayState).toBe("dialing");
  });

  test("a stale provider status does not repaint after a new dial starts", () => {
    const { result, rerender } = renderFlow("dialing");

    act(() => polling.onStatus?.("failed"));
    rerender({ state: "failed" });
    expect(result.current.displayState).toBe("failed");

    rerender({ state: "dialing" });
    expect(result.current.displayState).toBe("dialing");
  });

  test("advancing to the next contact resets a finished call to idle", () => {
    const { result, rerender } = renderFlow("dialing");

    act(() => polling.onStatus?.("completed"));
    rerender({ state: "completed" });
    expect(result.current.displayState).toBe("completed");

    // The Next action sends NEXT to the FSM (completed -> idle); the bridge
    // must clear the lifecycle rather than keep showing the old outcome.
    rerender({ state: "idle" });
    expect(result.current.displayState).toBe("idle");
  });
});
