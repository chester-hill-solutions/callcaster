import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useCallRoom from "@/hooks/call/useCallRoom";
import { useCallState } from "@/hooks/call/useCallState";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";
import { usePredictiveCallSync } from "@/hooks/call/usePredictiveCallSync";
import * as connection from "@/lib/workspace-events-connection.client";
import type { UseCallStatusPollingOptions } from "@/hooks/call/useCallStatusPolling";

const polling = vi.hoisted(() => ({ options: null as UseCallStatusPollingOptions | null }));
vi.mock("@/hooks/call/useCallStatusPolling", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/call/useCallStatusPolling")>(),
  useCallStatusPolling: (options: UseCallStatusPollingOptions) => { polling.options = options; },
}));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/realtime/useWorkspaceEventSubscription")>(),
  useWorkspaceEventSubscription: vi.fn(),
}));

const rootA = "CA11111111111111111111111111111111", rootB = "CA22222222222222222222222222222222";
const room = "agent-a~owned-room";
const joined = { call_sid: rootA, user_id: "agent-a", campaign_id: 42, contact_id: 7, outreach_attempt_id: 17,
  conference_id: room, conference_sid: "CF11111111111111111111111111111111", conference_sequence: 7,
  customer_event: "joined", status: "in-progress" };
let listener: ((event: MessageEvent<string>) => void) | undefined;
const setNextRecipient = vi.fn(), setUpdate = vi.fn(), setConference = vi.fn();
const queue: Parameters<typeof usePredictiveCallSync>[0]["queue"] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
  vi.spyOn(connection, "subscribeToWorkspaceEventSource").mockImplementation((_url, callback) => {
    listener = callback; return () => { listener = undefined; };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function emit(payload: Record<string, unknown>) {
  if (!listener) throw new Error("Owned room listener is missing");
  act(() => listener?.(new MessageEvent("workspace_event", { data: JSON.stringify({ id: 1,
    workspace_id: "workspace-a", event_type: "predictive_broadcast", payload, created_at: "2026-10-30T12:00:00Z" }) })));
}
function renderFlow() {
  return renderHook(() => {
    const roomState = useCallRoom({ workspace: "workspace-a", userId: "agent-a", campaign: 42, conference: room });
    const fsm = useCallState();
    const flow = useCampaignCallFlow({ callSid: roomState.customerCallSid, confirmedCustomerSid: roomState.customerCallSid,
      agentLegSid: null, workspaceId: "workspace-a", state: fsm.state, activeCall: null,
      recentAttemptDisposition: null, predictiveState: roomState.predictiveState, isPredictive: true, send: fsm.send });
    usePredictiveCallSync({ predictiveState: roomState.predictiveState, queue, nextRecipient: null, send: fsm.send,
      setNextRecipient, setUpdate, conference: room, setConference });
    return { ...flow, fsmState: fsm.state };
  });
}

describe("predictive room and logical customer integration", () => {
  test("an AMD candidate is not a connected human or a customer control target", () => {
    const { result } = renderFlow();
    emit({ ...joined, customer_event: undefined, conference_sequence: undefined });
    expect(result.current.displayState).not.toBe("connected");
    expect(result.current.customerCallSid).toBeNull();
    expect(polling.options?.enabled).toBe(false);
    expect(setNextRecipient).not.toHaveBeenCalled();
  });

  test("a confirmed human owns polling and connected state without an SDK call", () => {
    const { result } = renderFlow(); emit(joined);
    expect(result.current.customerCallSid).toBe(rootA);
    expect(result.current.displayState).toBe("connected");
    expect(result.current.fsmState).toBe("connected");
    expect(polling.options).toMatchObject({ callSid: rootA, enabled: true });
  });

  test("a later joined human starts a new customer owner and rejects the old poll", () => {
    const { result } = renderFlow(); emit(joined);
    const oldPoll = polling.options?.onStatus;
    act(() => oldPoll?.("completed", rootA));
    expect(result.current.displayState).toBe("completed");
    emit({ ...joined, call_sid: rootB, contact_id: 8, outreach_attempt_id: 18, conference_sequence: 10 });
    expect(result.current.customerCallSid).toBe(rootB);
    expect(result.current.displayState).toBe("connected");
    expect(result.current.fsmState).toBe("connected");
    expect(polling.options).toMatchObject({ callSid: rootB, enabled: true });
    act(() => oldPoll?.("failed", rootA));
    expect(result.current.displayState).toBe("connected");
    expect(result.current.terminalCallSid).toBeNull();
  });

  test("a signed customer leave completes the conversation while its room stays selected", () => {
    const { result } = renderFlow(); emit(joined);
    emit({ ...joined, customer_event: "left", conference_sequence: 8, status: "completed" });
    expect(result.current.displayState).toBe("completed");
    expect(result.current.customerCallSid).toBe(rootA);
    expect(polling.options?.enabled).toBe(false);
    expect(setConference).not.toHaveBeenCalled();
  });
});
