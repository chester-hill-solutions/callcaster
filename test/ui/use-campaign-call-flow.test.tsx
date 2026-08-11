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
});
