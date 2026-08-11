import { describe, expect, test } from "vitest";
import {
  callLifecycleReducer,
  createCallLifecycle,
  type CallLifecycleState,
} from "@/lib/twilio/call-session-types";

const IDLE: CallLifecycleState = {
  phase: "idle",
  outcome: null,
  generation: 0,
  agentSid: null,
  customerSid: null,
};

describe("callLifecycleReducer", () => {
  describe("idle", () => {
    test("START_DIALING transitions to dialing", () => {
      const next = callLifecycleReducer(IDLE, { type: "START_DIALING" });
      expect(next.phase).toBe("dialing");
    });

    test("HANG_UP transitions to ended with canceled outcome", () => {
      const next = callLifecycleReducer(IDLE, { type: "HANG_UP" });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("canceled");
    });

    test("CONNECT is ignored at idle", () => {
      const next = callLifecycleReducer(IDLE, { type: "CONNECT" });
      expect(next.phase).toBe("idle");
    });
  });

  describe("dialing", () => {
    const DIALING: CallLifecycleState = { ...IDLE, phase: "dialing" };

    test("CONNECT transitions to connected", () => {
      const next = callLifecycleReducer(DIALING, { type: "CONNECT" });
      expect(next.phase).toBe("connected");
    });

    test("HANG_UP transitions to ending", () => {
      const next = callLifecycleReducer(DIALING, { type: "HANG_UP" });
      expect(next.phase).toBe("ending");
    });

    test("FAIL transitions to ended with failed outcome", () => {
      const next = callLifecycleReducer(DIALING, { type: "FAIL" });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("failed");
    });

    test("PROVIDER_ENDED transitions to ended with given outcome", () => {
      const next = callLifecycleReducer(DIALING, {
        type: "PROVIDER_ENDED",
        outcome: "no-answer",
      });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("no-answer");
    });
  });

  describe("connected", () => {
    const CONNECTED: CallLifecycleState = { ...IDLE, phase: "connected" };

    test("HANG_UP transitions to ending", () => {
      const next = callLifecycleReducer(CONNECTED, { type: "HANG_UP" });
      expect(next.phase).toBe("ending");
    });

    test("FAIL transitions to ended with failed outcome", () => {
      const next = callLifecycleReducer(CONNECTED, { type: "FAIL" });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("failed");
    });

    test("PROVIDER_ENDED transitions to ended with given outcome", () => {
      const next = callLifecycleReducer(CONNECTED, {
        type: "PROVIDER_ENDED",
        outcome: "completed",
      });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("completed");
    });
  });

  describe("ending (terminal — cannot regress)", () => {
    const ENDING: CallLifecycleState = {
      ...IDLE,
      phase: "ending",
      generation: 1,
      agentSid: "CA-agent",
    };

    test("START_DIALING goes to dialing (next generation)", () => {
      const next = callLifecycleReducer(ENDING, { type: "START_DIALING" });
      expect(next.phase).toBe("dialing");
      expect(next.generation).toBe(2);
      expect(next.agentSid).toBeNull();
    });

    test("CONNECT is ignored — display must NOT regress to connected", () => {
      const next = callLifecycleReducer(ENDING, { type: "CONNECT" });
      expect(next.phase).toBe("ending");
    });

    test("HANG_UP is ignored (no-op in terminal)", () => {
      const next = callLifecycleReducer(ENDING, { type: "HANG_UP" });
      expect(next.phase).toBe("ending");
    });

    test("FAIL is ignored", () => {
      const next = callLifecycleReducer(ENDING, { type: "FAIL" });
      expect(next.phase).toBe("ending");
    });

    test("PROVIDER_ENDED transitions to ended with outcome", () => {
      const next = callLifecycleReducer(ENDING, {
        type: "PROVIDER_ENDED",
        outcome: "completed",
      });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("completed");
    });
  });

  describe("ended (terminal — cannot regress)", () => {
    const ENDED: CallLifecycleState = {
      ...IDLE,
      phase: "ended",
      outcome: "completed",
      generation: 1,
    };

    test("START_DIALING goes to dialing (next generation)", () => {
      const next = callLifecycleReducer(ENDED, { type: "START_DIALING" });
      expect(next.phase).toBe("dialing");
      expect(next.generation).toBe(2);
    });

    test("CONNECT is ignored", () => {
      const next = callLifecycleReducer(ENDED, { type: "CONNECT" });
      expect(next.phase).toBe("ended");
    });

    test("HANG_UP is ignored", () => {
      const next = callLifecycleReducer(ENDED, { type: "HANG_UP" });
      expect(next.phase).toBe("ended");
    });

    test("PROVIDER_ENDED is ignored (already ended)", () => {
      const next = callLifecycleReducer(ENDED, {
        type: "PROVIDER_ENDED",
        outcome: "no-answer",
      });
      expect(next.phase).toBe("ended");
      expect(next.outcome).toBe("completed");
    });

    test("RESET clears to idle", () => {
      const next = callLifecycleReducer(ENDED, { type: "RESET" });
      expect(next.phase).toBe("idle");
      expect(next.outcome).toBeNull();
    });
  });

  describe("stale provider events (generation guard)", () => {
    test("provider non-terminal event for an older generation is silently ignored", () => {
      // Simulate: user hung up (generation=1), a stale provider ringing arrives
      const ended: CallLifecycleState = {
        ...IDLE,
        phase: "ended",
        outcome: "completed",
        generation: 1,
      };
      const next = callLifecycleReducer(ended, { type: "CONNECT" });
      expect(next.phase).toBe("ended");
    });
  });
});

describe("createCallLifecycle", () => {
  test("initial state is idle with no outcome", () => {
    const lc = createCallLifecycle();
    expect(lc.getState().phase).toBe("idle");
    expect(lc.getState().outcome).toBeNull();
    expect(lc.isTerminal()).toBe(false);
    expect(lc.inProgress()).toBe(false);
  });

  test("start dialing marks inProgress", () => {
    const lc = createCallLifecycle();
    lc.dispatch({ type: "START_DIALING" });
    expect(lc.inProgress()).toBe(true);
    expect(lc.isTerminal()).toBe(false);
  });

  test("hangup from dialing marks ending (terminal, not inProgress)", () => {
    const lc = createCallLifecycle();
    lc.dispatch({ type: "START_DIALING" });
    lc.dispatch({ type: "HANG_UP" });
    expect(lc.getState().phase).toBe("ending");
    expect(lc.isTerminal()).toBe(true);
    expect(lc.inProgress()).toBe(false);
  });

  test("provider ended completes the ending phase", () => {
    const lc = createCallLifecycle();
    lc.dispatch({ type: "START_DIALING" });
    lc.dispatch({ type: "HANG_UP" });
    lc.dispatch({ type: "PROVIDER_ENDED", outcome: "completed" });
    expect(lc.getState().phase).toBe("ended");
    expect(lc.getState().outcome).toBe("completed");
    expect(lc.hasOutcome()).toBe(true);
  });

  test("new dial resets generation and goes to dialing", () => {
    const lc = createCallLifecycle();
    lc.dispatch({ type: "START_DIALING" });
    lc.dispatch({ type: "HANG_UP" });
    const gen1 = lc.getState().generation;
    lc.dispatch({ type: "START_DIALING" });
    expect(lc.getState().phase).toBe("dialing");
    expect(lc.getState().generation).toBe(gen1 + 1);
  });
});
