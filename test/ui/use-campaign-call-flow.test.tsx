import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";
import type { UseCallStatusPollingOptions } from "@/hooks/call/useCallStatusPolling";
import { manualRecovery } from "../helpers/manual-recovery-fixture";

const polling = vi.hoisted(() => ({
  onStatus: null as UseCallStatusPollingOptions["onStatus"],
  options: null as UseCallStatusPollingOptions | null,
}));
const subscription = vi.hoisted(() => ({
  options: null as Parameters<typeof import("@/hooks/realtime/useWorkspaceEventSubscription").useWorkspaceEventSubscription>[0] | null,
}));

vi.mock("@/hooks/call/useCallStatusPolling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/call/useCallStatusPolling")>()),
  useCallStatusPolling: (options: UseCallStatusPollingOptions) => {
    polling.options = options;
    polling.onStatus = options.onStatus;
  },
}));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/realtime/useWorkspaceEventSubscription")>()),
  useWorkspaceEventSubscription: (options: NonNullable<typeof subscription.options>) => { subscription.options = options; },
}));

describe("current customer control ownership", () => {
  const previous = "CA11111111111111111111111111111111", current = "CA22222222222222222222222222222222";
  const agent = "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  test.each(["ringing", "in-progress", "completed"] as const)("manual recovery keeps the actual %s state and terminal status wins over later reads", status => {
    const saved = manualRecovery({ provider_status: status }), send = vi.fn(), onServerCustomerOwned = vi.fn();
    const { result, rerender } = renderHook(({ recovery }) => useCampaignCallFlow({
      callSid: null, agentLegSid: saved.agent_call_sid, workspaceId: saved.workspace_id, state: "idle", activeCall: null,
      recentAttemptDisposition: null, predictiveState: { status: "idle", contact_id: null }, isPredictive: false, send,
      manualRecovery: recovery, onServerCustomerOwned,
    }), { initialProps: { recovery: saved } });
    expect(result.current.customerCallSid).toBe(saved.call_sid);
    expect(result.current.displayState).toBe(status === "ringing" ? "dialing" : status === "in-progress" ? "connected" : "completed");
    expect(onServerCustomerOwned).toHaveBeenCalledWith(true);
    act(() => result.current.confirmCustomerEnded());
    rerender({ recovery: { ...saved, provider_status: "in-progress" } });
    expect(result.current.displayState).toBe("completed");
  });
  test.each(["Start", "Next", "Hangup"])("a local %s retires an older manual current read even while idle", command => {
    const saved = manualRecovery(), send = vi.fn();
    const { result, rerender } = renderHook(({ recovery }: { recovery: ReturnType<typeof manualRecovery> | null }) => useCampaignCallFlow({
      callSid: null, agentLegSid: saved.agent_call_sid, workspaceId: saved.workspace_id, state: "idle", activeCall: null,
      recentAttemptDisposition: null, predictiveState: { status: "idle", contact_id: null }, isPredictive: false, send, manualRecovery: recovery,
    }), { initialProps: { recovery: null } });
    act(() => { if (command === "Start") result.current.beginDial(); else if (command === "Hangup") result.current.confirmCustomerEnded(); else result.current.retireManualRecovery(); }); rerender({ recovery: saved });
    expect(result.current.customerCallSid).toBeNull(); expect(result.current.recoveredManual).toBeNull();
    expect(result.current.displayState).toBe(command === "Start" ? "dialing" : command === "Hangup" ? "completed" : "idle");
  });
  function renderCustomer() {
    const send = vi.fn();
    const view = renderHook(({ callSid }) => useCampaignCallFlow({
      callSid, agentLegSid: agent, workspaceId: "workspace-a", state: "dialing", activeCall: null,
      recentAttemptDisposition: null, predictiveState: { status: "idle", contact_id: null }, isPredictive: false, send,
    }), { initialProps: { callSid: previous } });
    return { ...view, send };
  }

  test("a new dial does not poll the previous customer while its new identity is pending", () => {
    const { result, rerender } = renderCustomer();
    act(() => polling.onStatus?.("completed", previous));
    act(() => result.current.beginDial());
    expect(polling.options?.enabled).toBe(false);
    expect(polling.options?.callSid).toBeNull();
    rerender({ callSid: current });
    expect(polling.options?.enabled).toBe(true);
    expect(polling.options?.callSid).toBe(current);
    act(() => polling.onStatus?.("in-progress", current));
    expect(result.current.displayState).toBe("connected");
  });

  test("a manual receipt binds its root without claiming the customer has answered", () => {
    const { result, send } = renderCustomer();
    let accept: (sid: string) => boolean = () => false;
    act(() => { accept = result.current.beginDial(); });
    send.mockClear();
    act(() => { expect(accept(current)).toBe(true); });
    expect(result.current.customerCallSid).toBe(current);
    expect(result.current.displayState).toBe("dialing");
    expect(polling.options?.callSid).toBe(current);
    expect(send).not.toHaveBeenCalledWith({ type: "CONNECT" });
    act(() => polling.onStatus?.("in-progress", current));
    expect(result.current.displayState).toBe("connected");
    act(() => polling.onStatus?.("completed", current));
    act(() => { expect(accept(current)).toBe(true); });
    expect(result.current.displayState).toBe("completed");
  });

  test("a manual receipt cannot bind an agent leg or cross into the next customer owner", () => {
    const { result } = renderCustomer();
    let accept: (sid: string) => boolean = () => false;
    act(() => { accept = result.current.beginDial(); });
    act(() => { expect(accept(agent)).toBe(false); });
    act(() => result.current.beginDial());
    act(() => { expect(accept(current)).toBe(false); });
    expect(result.current.customerCallSid).toBeNull();
  });

  test("a fresh callback cannot restore the previous customer during a new dial", () => {
    const { result, send } = renderCustomer();
    act(() => polling.onStatus?.("completed", previous));
    act(() => result.current.beginDial());
    send.mockClear();
    act(() => polling.onStatus?.("completed", previous));
    expect(result.current.displayState).toBe("dialing");
    expect(result.current.terminalCallSid).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test.each([null, previous])("a new SDK source and dialing state in one commit can resolve their own customer (%s)", (initialSid) => {
    const send = vi.fn();
    const { result, rerender } = renderHook(({ callSid, state }: { callSid: string | null; state: string }) => useCampaignCallFlow({
      callSid, agentLegSid: callSid === agent ? agent : null, workspaceId: "workspace-a", state, activeCall: null,
      recentAttemptDisposition: null, predictiveState: { status: "idle", contact_id: null }, isPredictive: false, send,
    }), { initialProps: { callSid: initialSid, state: "idle" } });
    rerender({ callSid: agent, state: "dialing" });
    expect(polling.options?.enabled).toBe(true);
    expect(polling.options?.callSid).toBe(agent);
    act(() => polling.onStatus?.("in-progress", agent));
    expect(result.current.displayState).toBe("dialing");
    expect(send).not.toHaveBeenCalled();
    act(() => polling.onStatus?.("in-progress", current));
    expect(result.current.displayState).toBe("connected");
    expect(polling.options?.callSid).toBe(current);
  });

  test("a resolved root or sibling child cannot replace the accepted customer", () => {
    const { result, rerender, send } = renderCustomer();
    rerender({ callSid: current });
    act(() => polling.onStatus?.("in-progress", current));
    send.mockClear();
    act(() => polling.onStatus?.("completed", previous));
    act(() => subscription.options?.onChange({ eventType: "UPDATE", table: "call", new: {
      sid: previous, parent_call_sid: agent, status: "completed", workspace: "workspace-a",
    }, old: null }));
    expect(result.current.displayState).toBe("connected");
    expect(result.current.terminalCallSid).toBeNull();
    expect(polling.options?.callSid).toBe(current);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("customer identity across agent audio changes", () => {
  const agentA = "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", agentB = "CAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const customerA = "CA11111111111111111111111111111111", customerB = "CA22222222222222222222222222222222";
  function renderCustomer() {
    const send = vi.fn();
    const view = renderHook(({ agent, state }: { agent: string | null; state: string }) => useCampaignCallFlow({
      callSid: agent, agentLegSid: agent, workspaceId: "workspace-a", state, activeCall: null,
      recentAttemptDisposition: null, predictiveState: { status: "idle", contact_id: null }, isPredictive: false, send,
    }), { initialProps: { agent: null, state: "idle" } });
    act(() => view.result.current.beginDial());
    view.rerender({ agent: agentA, state: "dialing" });
    return { ...view, send };
  }

  test("an agent replacement retains the connected customer and its poll target", () => {
    const { result, rerender } = renderCustomer();
    act(() => polling.onStatus?.("in-progress", customerA));
    expect(result.current.displayState).toBe("connected");
    rerender({ agent: agentB, state: "connected" });
    expect(result.current.displayState).toBe("connected");
    expect(polling.options?.callSid).toBe(customerA);
  });

  test("an agent replacement cannot erase the customer's terminal outcome", () => {
    const { result, rerender } = renderCustomer();
    act(() => polling.onStatus?.("no-answer", customerA));
    rerender({ agent: agentA, state: "completed" });
    expect(result.current.terminalCallSid).toBe(customerA);
    rerender({ agent: agentB, state: "completed" });
    expect(result.current.displayState).toBe("no-answer");
    expect(result.current.terminalCallSid).toBe(customerA);
    expect(polling.options?.callSid).toBe(customerA);
  });

  test("a retired provider callback cannot end the next logical dial", () => {
    const { result, rerender, send } = renderCustomer();
    act(() => polling.onStatus?.("in-progress", customerA));
    expect(polling.options?.enabled).toBe(true);
    const oldStatus = polling.onStatus;
    act(() => polling.onStatus?.("no-answer", customerA));
    act(() => result.current.beginDial());
    send.mockClear();
    act(() => oldStatus?.("completed", customerA));
    expect(result.current.displayState).toBe("dialing");
    expect(result.current.terminalCallSid).toBeNull();
    expect(send).not.toHaveBeenCalled();
    rerender({ agent: agentB, state: "dialing" });
    act(() => polling.onStatus?.("in-progress", customerB));
    expect(result.current.displayState).toBe("connected");
    expect(polling.options?.callSid).toBe(customerB);
  });
});

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

  // The #1220 tests above assert displayState *after* effects have flushed, so
  // they cannot see a stale value that is painted and then corrected. These
  // record every render instead: pressing Dial must not paint the old outcome
  // for even one frame, which is what the agent saw as an error flash.
  describe("pressing Dial paints no stale frame", () => {
    /**
     * Mirrors the real click: useCampaignDialActions sends START_DIALING to the
     * FSM (whose state lives above this hook) and calls beginDial() in the same
     * handler, so both land in one batch.
     */
    function renderDialProbe(disposition: string | null) {
      const renders: string[] = [];
      const send = vi.fn();
      const view = renderHook(() => {
        const [fsmState, setFsmState] = useState("idle");
        const [callSid, setCallSid] = useState<string | null>(null);
        const flow = useCampaignCallFlow({
          callSid,
          agentLegSid: null,
          workspaceId: "w1",
          state: fsmState,
          activeCall: null,
          recentAttemptDisposition: disposition,
          predictiveState: { status: "unknown", contact_id: null },
          isPredictive: false,
          send,
        });
        renders.push(flow.displayState);
        return { ...flow, setFsmState, setCallSid };
      });

      let dial = 0;
      const pressDial = () =>
        act(() => {
          view.result.current.setFsmState("dialing");
          view.result.current.beginDial();
          view.result.current.setCallSid(`CA${++dial}`);
        });

      return { ...view, renders, pressDial };
    }

    test("the finished call's outcome never repaints on the next dial", () => {
      const probe = renderDialProbe(null);

      probe.pressDial();
      act(() => polling.onStatus?.("failed"));
      act(() => probe.result.current.setFsmState("failed"));
      expect(probe.result.current.displayState).toBe("failed");

      probe.renders.length = 0;
      probe.pressDial();
      expect(probe.renders).not.toContain("failed");
      expect(probe.result.current.displayState).toBe("dialing");
    });

    test("a re-dialed contact's last disposition never repaints", () => {
      // nextNumber loads the new contact's existing attempt, so a contact who
      // was reached once already carries a disposition into the dial.
      const probe = renderDialProbe("no-answer");
      expect(probe.result.current.displayState).toBe("no-answer");

      probe.renders.length = 0;
      probe.pressDial();
      expect(probe.renders).not.toContain("no-answer");
      expect(probe.result.current.displayState).toBe("dialing");
    });
  });
});
