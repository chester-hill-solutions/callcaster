import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useCallRoom from "@/hooks/call/useCallRoom";
import { usePredictiveCallSync } from "@/hooks/call/usePredictiveCallSync";
import * as connection from "@/lib/workspace-events-connection.client";

afterEach(() => vi.unstubAllGlobals());

test("the room end event clears only the matching conference, including an agent with no contact", async () => {
  let listener: ((event: MessageEvent<string>) => void) | undefined;
  vi.spyOn(connection, "subscribeToWorkspaceEventSource").mockImplementation((_url, onEvent) => {
    listener = onEvent;
    return () => undefined;
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  const send = vi.fn();
  const setNextRecipient = vi.fn();
  const setUpdate = vi.fn();
  const { result } = renderHook(() => {
    const [conference, setConference] = useState<string | null>("u1~active");
    const room = useCallRoom({ workspace: "w1", campaign: 42, userId: "u1", conference });
    usePredictiveCallSync({
      predictiveState: room.predictiveState, queue: [], nextRecipient: null,
      send, setNextRecipient, setUpdate, conference, setConference,
    });
    return { ...room, conference, setConference };
  });
  const emit = (payload: Record<string, unknown>) => {
    if (!listener) throw new Error("SSE listener was not registered");
    act(() => listener?.(new MessageEvent("workspace_event", { data: JSON.stringify({
      id: 1, workspace_id: "w1", event_type: "predictive_broadcast",
      payload, created_at: "2026-10-02T00:00:00.000Z",
    }) })));
  };

  emit({ contact_id: 7, status: "in-progress" });
  expect(result.current.predictiveState.status).toBe("connected");
  expect(send).toHaveBeenCalledWith({ type: "CONNECT" });
  send.mockClear();

  emit({ contact_id: null, status: "completed", conference_ended: true, conference_id: "u2~other" });
  expect(result.current.predictiveState.status).toBe("connected");
  expect(result.current.conference).toBe("u1~active");
  expect(send).not.toHaveBeenCalled();

  emit({ contact_id: 99, status: "completed", conference_id: "u2~other" });
  expect(result.current.predictiveState.status).toBe("connected");
  expect(result.current.conference).toBe("u1~active");
  expect(send).not.toHaveBeenCalled();

  emit({ contact_id: 7, status: "completed", conference_id: "u1~active" });
  expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
  expect(result.current.conference).toBe("u1~active");
  send.mockClear();

  emit({ contact_id: null, status: "completed", conference_ended: true, conference_id: "u1~active" });
  expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
  expect(result.current.conference).toBeNull();
  expect(result.current.predictiveState.status).toBe("completed");

  act(() => result.current.setConference("u1~next"));
  emit({ contact_id: 8, status: "in-progress", conference_id: "u1~next" });
  expect(result.current.predictiveState.status).toBe("connected");
  send.mockClear();
  emit({ contact_id: null, status: "completed", conference_ended: true, conference_id: "u1~active" });
  expect(result.current.conference).toBe("u1~next");
  expect(send).not.toHaveBeenCalled();
  emit({ contact_id: 7, status: "completed", conference_id: "u1~active" });
  expect(result.current.predictiveState.status).toBe("connected");
  expect(result.current.conference).toBe("u1~next");
  expect(send).not.toHaveBeenCalled();
  expect(connection.subscribeToWorkspaceEventSource).toHaveBeenCalledTimes(1);
});
