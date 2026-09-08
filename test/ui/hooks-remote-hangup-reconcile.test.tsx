import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useRemoteHangupReconcile } from "@/hooks/call/useRemoteHangupReconcile";

type Props = {
  displayState: string;
  callState: string;
  isPredictive: boolean;
};

function setup(initial: Props) {
  const hangUp = vi.fn(async () => {});
  const view = renderHook(
    (props: Props) => useRemoteHangupReconcile({ ...props, hangUp }),
    { initialProps: initial },
  );
  return { hangUp, rerender: view.rerender };
}

describe("app/hooks/call/useRemoteHangupReconcile.ts", () => {
  test("hangs up the lingering agent leg when the display goes terminal mid-call (#1292)", () => {
    const { hangUp, rerender } = setup({
      displayState: "connected",
      callState: "connected",
      isPredictive: false,
    });
    expect(hangUp).not.toHaveBeenCalled();

    // Contact hangs up: provider marks the customer leg complete, the SDK
    // still says connected.
    rerender({ displayState: "completed", callState: "connected", isPredictive: false });
    expect(hangUp).toHaveBeenCalledTimes(1);

    // Later renders in the same terminal state must not hang up again.
    rerender({ displayState: "completed", callState: "connected", isPredictive: false });
    rerender({ displayState: "completed", callState: "completed", isPredictive: false });
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  test("does nothing when the SDK already ended the call", () => {
    const { hangUp, rerender } = setup({
      displayState: "connected",
      callState: "connected",
      isPredictive: false,
    });
    rerender({ displayState: "completed", callState: "completed", isPredictive: false });
    expect(hangUp).not.toHaveBeenCalled();
  });

  test("leaves an inbound call alone when the display was already terminal from the last attempt", () => {
    // Answering an inbound call on the campaign screen: callState flips to
    // connected while displayState still shows the previous attempt's
    // outcome. That is not a transition, so nothing is torn down.
    const { hangUp, rerender } = setup({
      displayState: "completed",
      callState: "idle",
      isPredictive: false,
    });
    rerender({ displayState: "completed", callState: "connected", isPredictive: false });
    expect(hangUp).not.toHaveBeenCalled();
  });

  test("never fires in predictive mode, where the agent leg stays in the conference", () => {
    const { hangUp, rerender } = setup({
      displayState: "connected",
      callState: "connected",
      isPredictive: true,
    });
    rerender({ displayState: "completed", callState: "connected", isPredictive: true });
    expect(hangUp).not.toHaveBeenCalled();
  });

  test("covers every terminal display value", () => {
    for (const terminal of ["failed", "no-answer", "voicemail"]) {
      const { hangUp, rerender } = setup({
        displayState: "dialing",
        callState: "dialing",
        isPredictive: false,
      });
      rerender({ displayState: terminal, callState: "dialing", isPredictive: false });
      expect(hangUp, terminal).toHaveBeenCalledTimes(1);
    }
  });
});
