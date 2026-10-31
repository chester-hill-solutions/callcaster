import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useCallRoom from "@/hooks/call/useCallRoom";
import { useAgentAudioConnection } from "@/hooks/call/useAgentAudioConnection";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useRecoveredPredictiveSubject } from "@/hooks/call/useRecoveredPredictiveSubject";
import * as events from "@/lib/workspace-events-connection.client";
import type { PredictiveCustomerRecovery } from "@/lib/schemas/api/voice-audio";
import type { OutreachAttempt } from "@/lib/types";
import { current, intent, owner } from "../helpers/voice-audio-current-fixture";
import { recoveredContact, recoveredCustomer as customer, recovery } from "../helpers/predictive-recovery-fixture";

let listener: ((event: MessageEvent<string>) => void) | undefined;
const options = { userId: owner.userId, workspaceId: owner.workspaceId, campaignId: "42", callerId: "+16135550100", selectedDevice: "+16135550123" };
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
  vi.spyOn(events, "subscribeToWorkspaceEventSource").mockImplementation((_url, callback) => { listener = callback; return () => { listener = undefined; }; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function emit(patch: Record<string, unknown> = {}) {
  act(() => listener?.(new MessageEvent("workspace_event", { data: JSON.stringify({ id: 1, workspace_id: owner.workspaceId,
    event_type: "predictive_broadcast", created_at: "2026-10-31T12:00:00Z", payload: { ...customer,
      status: "in-progress", customer_event: "joined", human_revision: "11", conference_sequence: 8, ...patch } }) })));
}
function room(recovered: PredictiveCustomerRecovery | null = recovery()) {
  return renderHook(({ recovered }) => useCallRoom({ workspace: owner.workspaceId, userId: owner.userId,
    campaign: 42, conference: customer.conference_id, recovery: recovered }), { initialProps: { recovered } });
}

describe("predictive reload and missed-event recovery", () => {
  test("empty browser storage restores working phone, actual customer, contact and saved answers using reads only", async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      const path = String(url);
      if (path.includes("current=1")) return Response.json({ ...current(intent()), customer_pending: true, predictive: recovery() });
      if (path.includes("/queue?queue_id=27")) return Response.json({ item: recoveredContact });
      return Response.json({ success: true });
    });
    const { result } = renderHook(() => {
      const audio = useAgentAudioConnection(owner.workspaceId, owner.userId);
      const start = useStartConferenceAndDial({ ...options, recovery: audio.state.predictiveRecovery });
      const call = useCallRoom({ workspace: owner.workspaceId, userId: owner.userId, campaign: 42,
        conference: start.conference, recovery: audio.state.predictiveRecovery });
      const subject = useRecoveredPredictiveSubject(call.recoveredCustomer, []);
      return { audio, start, call, subject };
    });
    await waitFor(() => expect(result.current.subject.contact?.contact.firstname).toBe("Current customer"));
    expect(result.current.start.conference).toBe(customer.conference_id);
    expect(result.current.call.customerCallSid).toBe(customer.call_sid);
    expect(result.current.call.predictiveState.status).toBe("connected");
    expect(result.current.subject.attempt).toMatchObject({ id: 17, result: { q1: "saved answer" } });
    expect(result.current.audio.state.active?.callSid).not.toBe(customer.call_sid);
    expect(result.current.audio.state.active?.transport).toBe("phone");
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/connect-phone-device"))).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/start-conference") || String(url).includes("/api/hangup"))).toBe(false);
  });

  test("a pending human restores the room but cannot become a joined control target", () => {
    const { result } = room(recovery("9", { ...customer, human_state: "pending", conference_sequence: null }));
    expect(result.current.customerCallSid).toBeNull();
    expect(result.current.predictiveState.status).toBe("dialing");
    emit(); expect(result.current.customerCallSid).toBe(customer.call_sid);
    expect(result.current.predictiveState.status).toBe("connected");
  });

  test("a late GET cannot replace the newer SSE customer or clear it", () => {
    const { result, rerender } = room();
    const root = "CA44444444444444444444444444444444";
    emit({ call_sid: root, contact_id: 8, outreach_attempt_id: 18, human_revision: "20", conference_sequence: 12 });
    rerender({ recovered: recovery("12") });
    expect(result.current.customerCallSid).toBe(root);
    rerender({ recovered: recovery("19", null) });
    expect(result.current.predictiveState.status).toBe("connected");
    expect(result.current.customerCallSid).toBe(root);
  });

  test.each(["10", "12"])("an empty read at version %s ends a missed leave and cannot be undone by the old joined read", revision => {
    const { result, rerender } = room();
    rerender({ recovered: recovery(revision, null) });
    expect(result.current.predictiveState.status).toBe("completed");
    expect(result.current.customerCallSid).toBe(customer.call_sid);
    rerender({ recovered: recovery() }); emit({ human_revision: "10", conference_sequence: 9 });
    expect(result.current.predictiveState.status).toBe("completed");
  });

  test("a newer GET wins over an older GET even without an SSE event", () => {
    const { result, rerender } = room();
    const next = { ...customer, call_sid: "CA44444444444444444444444444444444", contact_id: 8,
      attempt: { ...customer.attempt, contact_id: 8 } };
    rerender({ recovered: recovery("20", next) });
    rerender({ recovered: recovery("10") });
    expect(result.current.customerCallSid).toBe(next.call_sid);
  });

  test.each(["workspace_id", "user_id", "campaign_id", "conference_id"])("a snapshot from another %s cannot restore this room", field => {
    const { result } = room(recovery("10", { ...customer, [field]: field === "campaign_id" ? 99 : "foreign" }));
    expect(result.current.customerCallSid).toBeNull(); expect(result.current.predictiveState.status).toBe("idle");
  });

  test("an empty read also ends a pending customer without granting joined controls", () => {
    const { result, rerender } = room(recovery("9", { ...customer, human_state: "pending", conference_sequence: null }));
    rerender({ recovered: recovery("10", null) });
    expect(result.current.predictiveState.status).toBe("completed"); expect(result.current.customerCallSid).toBeNull();
  });

  test("a failed local preflight leaves valid room recovery available", async () => {
    const { result, rerender } = renderHook(({ recovered }) => useStartConferenceAndDial({ ...options, callerId: "", recovery: recovered }),
      { initialProps: { recovered: null as PredictiveCustomerRecovery | null } });
    await act(async () => { await result.current.begin(); });
    rerender({ recovered: recovery() }); expect(result.current.conference).toBe(customer.conference_id);
    expect(fetch).not.toHaveBeenCalled();
    rerender({ recovered: recovery("12", null) }); expect(result.current.conference).toBe(customer.conference_id);
  });

  test("an equal-version GET adds exact context after a versioned SSE join", () => {
    const { result, rerender } = room(null); emit();
    expect(result.current.recoveredCustomer).toBeNull();
    rerender({ recovered: recovery("11") });
    expect(result.current.recoveredCustomer?.queue_id).toBe(27);
  });

  test("local Stop prevents a delayed read from restoring the old room", () => {
    const { result, rerender } = renderHook(({ recovered }) => useStartConferenceAndDial({ ...options, recovery: recovered }),
      { initialProps: { recovered: null as PredictiveCustomerRecovery | null } });
    act(() => result.current.setConference(null));
    rerender({ recovered: recovery() });
    expect(result.current.conference).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });

  test("a valid local Start retires delayed room recovery even if its response is unknown", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("lost Start response"));
    const { result, rerender } = renderHook(({ recovered }) => useStartConferenceAndDial({ ...options, recovery: recovered }),
      { initialProps: { recovered: null as PredictiveCustomerRecovery | null } });
    await act(async () => { await result.current.begin(); });
    rerender({ recovered: recovery() }); expect(result.current.conference).toBeNull();
    expect(result.current.awaitingReceipt).toBe(true);
  });

  test("retained recovery commands cannot change a different workspace", () => {
    const { result, rerender } = renderHook(props => useStartConferenceAndDial(props), { initialProps: options });
    const old = result.current.restoreConference;
    rerender({ ...options, workspaceId: "10000000-0000-4000-8000-000000000002" });
    act(() => old(customer.conference_id)); expect(result.current.conference).toBeNull();
  });

  test("the saved result wins over the older loader row, then a later attempt event can update it", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ item: recoveredContact }));
    const prior: OutreachAttempt = { ...customer.attempt, result: { q1: "old loader answer" }, call: [] };
    const { result, rerender } = renderHook(({ attempts }) => useRecoveredPredictiveSubject(customer, attempts), { initialProps: { attempts: [prior] } });
    expect(result.current.contact).toBeNull(); expect(result.current.attempt).toBeNull();
    await waitFor(() => expect(result.current.contact?.contact.id).toBe(7));
    expect(result.current.attempt?.result).toEqual({ q1: "saved answer" });
    rerender({ attempts: [{ ...prior, result: { q1: "new agent answer" } }] });
    expect(result.current.attempt?.result).toEqual({ q1: "new agent answer" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(["workspace", "campaign_id", "contact_id", "id"])("a queue reply with a different %s cannot expose or save a contact", async field => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ item: { ...recoveredContact, [field]: field === "workspace" ? "foreign" : 99 } }));
    const { result } = renderHook(() => useRecoveredPredictiveSubject(customer, []));
    await waitFor(() => expect(result.current.error).toMatch(/could not be confirmed/));
    expect(result.current.contact).toBeNull(); expect(result.current.attempt).toBeNull();
  });

  test("a late contact reply cannot fill the next actor's screen", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = renderHook(({ saved }) => useRecoveredPredictiveSubject(saved, []),
      { initialProps: { saved: customer as typeof customer | null } });
    rerender({ saved: null });
    await act(async () => { finish(Response.json({ item: recoveredContact })); });
    expect(result.current.owns).toBe(false); expect(result.current.contact).toBeNull();
  });
});
