import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useCallRoom from "@/hooks/call/useCallRoom";
import * as connection from "@/lib/workspace-events-connection.client";

const rootA = "CA11111111111111111111111111111111", rootB = "CA22222222222222222222222222222222";
const owned = { call_sid: rootA, user_id: "user-a", campaign_id: 42, contact_id: 7, outreach_attempt_id: 17,
  conference_id: "user-a~owned-room", conference_sid: "CF11111111111111111111111111111111",
  conference_sequence: 7, customer_event: "joined", status: "in-progress" };
let listener: ((event: MessageEvent<string>) => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
  vi.spyOn(connection, "subscribeToWorkspaceEventSource").mockImplementation((_url, callback) => {
    listener = callback; return () => { listener = undefined; };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function emit(payload: Record<string, unknown>, workspace = "workspace-a") {
  if (!listener) throw new Error("Owned room listener is not registered");
  act(() => listener?.(new MessageEvent("workspace_event", { data: JSON.stringify({
    id: 1, workspace_id: workspace, event_type: "predictive_broadcast", payload, created_at: "2026-10-30T12:00:00Z",
  }) })));
}
function renderRoom() {
  return renderHook(({ conference }) => useCallRoom({ workspace: "workspace-a", campaign: 42,
    userId: "user-a", conference }), { initialProps: { conference: owned.conference_id } });
}

describe("owned predictive customer context", () => {
  test("a confirmed join retains the actual customer and complete server context", () => {
    const { result } = renderRoom(); emit(owned);
    expect(result.current.predictiveState).toMatchObject({ ...owned, status: "connected" });
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test.each([
    ["workspace", {}, "workspace-b"], ["actor", { user_id: "user-b" }, "workspace-a"],
    ["campaign", { campaign_id: 43 }, "workspace-a"], ["room", { conference_id: "user-a~other-room" }, "workspace-a"],
  ])("a different %s cannot publish a customer into this screen", (_kind, patch, workspace) => {
    const { result } = renderRoom(); emit({ ...owned, ...patch }, workspace);
    expect(result.current.predictiveState).toMatchObject({ contact_id: null, status: "idle" });
  });

  test("an unscoped status cannot impersonate this room's customer", () => {
    const { result } = renderRoom(); emit({ contact_id: 7, status: "in-progress", conference_id: owned.conference_id });
    expect(result.current.predictiveState.status).toBe("idle");
  });

  test.each([undefined, -1, "7", null])("a join with invalid conference order %s cannot become current", sequence => {
    const { result } = renderRoom(); emit({ ...owned, conference_sequence: sequence });
    expect(result.current.predictiveState.status).toBe("idle");
  });

  test("a background candidate cannot end or replace the joined human", () => {
    const { result } = renderRoom(); emit(owned);
    expect(result.current.predictiveState.status).toBe("connected");
    emit({ ...owned, call_sid: rootB, contact_id: 8, outreach_attempt_id: 18,
      customer_event: undefined, conference_sequence: undefined, status: "completed" });
    expect(result.current.predictiveState.status).toBe("connected");
    expect(result.current.predictiveState.contact_id).toBe(7);
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test("a delayed old join cannot replace a later joined customer", () => {
    const { result } = renderRoom(); emit(owned);
    emit({ ...owned, status: "completed", customer_event: undefined, conference_sequence: undefined });
    emit({ ...owned, call_sid: rootB, contact_id: 8, outreach_attempt_id: 18, conference_sequence: 10 });
    expect(result.current.predictiveState.contact_id).toBe(8);
    emit(owned);
    expect(result.current.predictiveState.contact_id).toBe(8);
    expect(result.current.customerCallSid).toBe(rootB);
  });

  test("a room change hides the previous room's customer before another event arrives", () => {
    const { result, rerender } = renderRoom(); emit(owned);
    expect(result.current.predictiveState.status).toBe("connected");
    rerender({ conference: "user-a~next-room" });
    expect(result.current.predictiveState).toMatchObject({ contact_id: null, status: "idle" });
    expect(result.current.customerCallSid).toBeNull();
    expect(connection.subscribeToWorkspaceEventSource).toHaveBeenCalledTimes(1);
  });

  test("a confirmed leave ends its human and rejects delayed progress and joins", () => {
    const { result } = renderRoom(); emit(owned);
    emit({ ...owned, customer_event: "left", conference_sequence: 8, status: "completed" });
    expect(result.current.predictiveState.status).toBe("completed");
    emit({ ...owned, customer_event: undefined, conference_sequence: undefined });
    emit(owned);
    expect(result.current.predictiveState.status).toBe("completed");
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test("the previous customer's leave cannot end the next joined human", () => {
    const { result } = renderRoom(); emit(owned);
    emit({ ...owned, call_sid: rootB, contact_id: 8, outreach_attempt_id: 18, conference_sequence: 10 });
    emit({ ...owned, customer_event: "left", conference_sequence: 11, status: "completed" });
    expect(result.current.customerCallSid).toBe(rootB);
    expect(result.current.predictiveState).toMatchObject({ contact_id: 8, status: "connected" });
  });

  test.each(["completed", "failed", "no-answer"])("a %s customer cannot be restored by late progress or its queued join", status => {
    const { result } = renderRoom(); emit(owned);
    emit({ ...owned, status, customer_event: undefined, conference_sequence: undefined });
    emit({ ...owned, customer_event: undefined, conference_sequence: undefined });
    emit({ ...owned, conference_sequence: 9 });
    expect(result.current.predictiveState.status).toBe(status);
    expect(result.current.customerCallSid).toBe(rootA);
  });
});
