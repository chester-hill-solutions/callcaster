import { describe, expect, test } from "vitest";
import { callLifecycleReducer, type CallLifecycleState } from "@/lib/twilio/call-session-types";

const BASE: CallLifecycleState = {
  phase: "idle",
  outcome: null,
  generation: 0,
  agentSid: null,
  customerSid: null,
};

describe("callLifecycleReducer - terminal precedence (#1206 fix)", () => {
  test("ending state cannot regress to dialing from ringing provider event", () => {
    const ending = callLifecycleReducer(
      { ...BASE, phase: "ending", generation: 1, agentSid: "CA-1" },
      { type: "CONNECT" },
    );
    expect(ending.phase).toBe("ending");
  });

  test("ending + PROVIDER_ENDED completed → ended + completed outcome", () => {
    let s = callLifecycleReducer(BASE, { type: "START_DIALING" });
    s = callLifecycleReducer(s, { type: "HANG_UP" });
    expect(s.phase).toBe("ending");
    s = callLifecycleReducer(s, { type: "PROVIDER_ENDED", outcome: "completed" });
    expect(s.phase).toBe("ended");
    expect(s.outcome).toBe("completed");
  });

  test("ending + PROVIDER_ENDED no-answer → ended + no-answer outcome", () => {
    let s = callLifecycleReducer(BASE, { type: "START_DIALING" });
    s = callLifecycleReducer(s, { type: "HANG_UP" });
    s = callLifecycleReducer(s, { type: "PROVIDER_ENDED", outcome: "no-answer" });
    expect(s.phase).toBe("ended");
    expect(s.outcome).toBe("no-answer");
  });

  test("ended + completed outcome + CONNECT event → still ended", () => {
    const ended = callLifecycleReducer(
      { ...BASE, phase: "ended", outcome: "completed", generation: 1 },
      { type: "CONNECT" },
    );
    expect(ended.phase).toBe("ended");
    expect(ended.outcome).toBe("completed");
  });

  test("ended + no-answer outcome + ringing provider via non-terminal event → still ended", () => {
    let s: CallLifecycleState = { ...BASE, phase: "ended", outcome: "no-answer", generation: 1 };
    // Simulate CONNECT (non-terminal provider event) arriving after no-answer
    s = callLifecycleReducer(s, { type: "CONNECT" });
    expect(s.phase).toBe("ended");
    expect(s.outcome).toBe("no-answer");
  });

  test("full hangup flow: dialing → hangup → ending → provider complete → ended", () => {
    let s = callLifecycleReducer(BASE, { type: "START_DIALING" });
    expect(s.phase).toBe("dialing");
    s = callLifecycleReducer(s, { type: "HANG_UP" });
    expect(s.phase).toBe("ending");
    s = callLifecycleReducer(s, { type: "PROVIDER_ENDED", outcome: "completed" });
    expect(s.phase).toBe("ended");
    expect(s.outcome).toBe("completed");

    // Even if a stale ringing arrives, it stays ended
    s = callLifecycleReducer(s, { type: "CONNECT" });
    expect(s.phase).toBe("ended");
  });
});
