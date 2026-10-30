import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { startTransition, Suspense, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";

const first = {
  userId: "user-a", workspaceId: "workspace-a", campaignId: "42", callerId: "+15550000001", selectedDevice: "+15550000002",
  audioSource: { connectionId: "11111111-1111-4111-8111-111111111111", generation: 7 },
};
const second = { ...first, selectedDevice: "+15550000003",
  audioSource: { connectionId: "22222222-2222-4222-8222-222222222222", generation: 8 } };
const rootA = "CA11111111111111111111111111111111", rootB = "CA22222222222222222222222222222222";
const accepted = (callSid = rootA) => Response.json({ success: true, conferenceName: "saved-phone-room", callSid });
const body = (index: number) => {
  const value = vi.mocked(fetch).mock.calls[index]?.[1]?.body;
  return value ? JSON.parse(String(value)) : null;
};
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(complete => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("predictive Start request and customer ownership", () => {
  test("an accepted phone result retains the real room and customer without an SDK Call", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(accepted());
    const { result } = renderHook(() => useStartConferenceAndDial(first));
    await act(async () => { await result.current.begin(); });
    expect(result.current.conference).toBe("saved-phone-room");
    expect(result.current.customerCallSid).toBe(rootA);
    act(() => result.current.setConference(null));
    expect(result.current.customerCallSid).toBeNull();
  });

  test("an unknown result replays the original immutable source after selection changes", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("owned lost response")).mockResolvedValueOnce(accepted());
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    expect(result.current.pendingStartIntentId).toBe(body(0).dial_intent_id);
    rerender(second);
    await act(async () => { await result.current.begin(); });
    expect(body(1)).toEqual(body(0));
    expect(body(1)).toMatchObject({ selected_device: "+15550000002", audio_connection_id: first.audioSource.connectionId, audio_generation: 7 });
    expect(result.current.customerCallSid).toBe(rootA);
    expect(result.current.pendingStartIntentId).toBeNull();
  });

  test("a malformed accepted phone reply keeps the same intent for receipt recovery", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, conferenceName: "saved-phone-room" })).mockResolvedValueOnce(accepted());
    const { result } = renderHook(() => useStartConferenceAndDial(first));
    await act(async () => { await result.current.begin(); });
    expect(result.current.conference).toBeNull();
    await act(async () => { await result.current.begin(); });
    expect(body(1).dial_intent_id).toBe(body(0).dial_intent_id);
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test.each([400, 401, 402, 403, 404, 429])("a definite HTTP %i refusal permits a corrected source", async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Selected device is not a verified phone number" }, { status })).mockResolvedValueOnce(accepted(rootB));
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    expect(result.current.pendingStartIntentId).toBeNull();
    rerender(second);
    await act(async () => { await result.current.begin(); });
    expect(body(1).dial_intent_id).not.toBe(body(0).dial_intent_id);
    expect(body(1)).toMatchObject({ selected_device: "+15550000003", audio_connection_id: second.audioSource.connectionId, audio_generation: 8 });
    expect(result.current.customerCallSid).toBe(rootB);
  });

  test.each([408, 409, 500, 502, 503, 504])("HTTP %i cannot prove that a customer was not sent", async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "provider result unknown" }, { status })).mockResolvedValueOnce(accepted());
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    rerender(second);
    await act(async () => { await result.current.begin(); });
    expect(body(1)).toEqual(body(0));
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test("missing current prerequisites cannot block replay of the saved unknown request", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("owned lost response")).mockResolvedValueOnce(accepted());
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    rerender({ ...second, callerId: "", selectedDevice: "" });
    expect(result.current.disabledReason).toBeNull();
    await act(async () => { await result.current.begin(); });
    expect(body(1)).toEqual(body(0));
    expect(result.current.customerCallSid).toBe(rootA);
  });

  test("parent mutation cannot alter the saved audio source after an unknown result", async () => {
    const options = { ...first, audioSource: { ...first.audioSource } };
    vi.mocked(fetch).mockRejectedValueOnce(new Error("owned lost response")).mockResolvedValueOnce(accepted());
    const { result, rerender } = renderHook(values => useStartConferenceAndDial(values), { initialProps: options });
    await act(async () => { await result.current.begin(); });
    options.audioSource.generation = 99;
    rerender(options);
    await act(async () => { await result.current.begin(); });
    expect(body(1)).toEqual(body(0));
  });

  test("an audio selection change during Start keeps the accepted customer and refuses another send", async () => {
    const reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    let pending!: Promise<void>;
    act(() => { pending = result.current.begin(); });
    rerender(second);
    await act(async () => { await result.current.begin(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { reply.resolve(accepted()); await pending; });
    expect(result.current.customerCallSid).toBe(rootA);
    expect(result.current.conference).toBe("saved-phone-room");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a retired workspace result cannot replace a new workspace start or release its pending lock", async () => {
    const old = deferred(), current = deferred();
    vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockResolvedValueOnce(Response.json({ success: true }));
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    let previous!: Promise<void>, next!: Promise<void>;
    act(() => { previous = result.current.begin(); });
    rerender({ ...second, workspaceId: "workspace-b", campaignId: "43" });
    expect(result.current.conference).toBeNull();
    act(() => { next = result.current.begin(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { old.resolve(accepted()); await previous; });
    expect(vi.mocked(fetch).mock.calls[2]?.[0]).toBe("/api/hangup");
    expect(body(2)).toEqual({ callSid: rootA, workspaceId: "workspace-a" });
    expect(result.current.conference).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => { current.resolve(accepted(rootB)); await next; });
    expect(result.current.customerCallSid).toBe(rootB);
  });

  test("an unmounted start cannot publish a late failure toast", async () => {
    const reply = deferred(), showError = vi.fn(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const { result, unmount } = renderHook(() => useStartConferenceAndDial({ ...first, showError }));
    let pending!: Promise<void>; act(() => { pending = result.current.begin(); });
    unmount();
    await act(async () => { reply.resolve(Response.json({ error: "private provider detail" }, { status: 500 })); await pending; });
    expect(showError).not.toHaveBeenCalled();
  });

  test("an unmounted phone Start ends its late known customer through the original workspace", async () => {
    const reply = deferred();
    vi.mocked(fetch).mockReturnValueOnce(reply.promise).mockResolvedValueOnce(Response.json({ success: true }));
    const { result, unmount } = renderHook(() => useStartConferenceAndDial(first));
    let pending!: Promise<void>; act(() => { pending = result.current.begin(); });
    unmount();
    await act(async () => { reply.resolve(accepted()); await pending; });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/hangup");
    expect(body(1)).toEqual({ callSid: rootA, workspaceId: "workspace-a" });
  });

  test("a callback from a retired screen cannot start another workspace's customer", async () => {
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    const oldBegin = result.current.begin;
    rerender({ ...second, workspaceId: "workspace-b" });
    await act(async () => { await oldBegin(); });
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(accepted(rootB));
    await act(async () => { await result.current.begin(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.customerCallSid).toBe(rootB);
  });

  test("a suspended scope render cannot retire the still-committed Start", async () => {
    const reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    let ready = false, resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    function Fixture() {
      const [options, setOptions] = useState(first);
      const start = useStartConferenceAndDial(options);
      if (options.workspaceId === "workspace-b" && !ready) throw gate;
      return <>
        <button onClick={() => { void start.begin(); }}>Begin</button>
        <button onClick={() => { startTransition(() => setOptions({ ...second, workspaceId: "workspace-b" })); }}>Change scope</button>
        <output aria-label="Customer">{start.customerCallSid}</output>
      </>;
    }
    render(<Suspense fallback={<p>Waiting for scope</p>}><Fixture /></Suspense>);
    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    fireEvent.click(screen.getByRole("button", { name: "Change scope" }));
    await act(async () => { reply.resolve(accepted()); });
    await waitFor(() => expect(screen.getByLabelText("Customer").textContent).toBe(rootA));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { ready = true; resume(); });
    expect(screen.getByLabelText("Customer")).toBeEmptyDOMElement();
  });

  test("an old room ending cannot cancel a newer Start request", async () => {
    const reply = deferred();
    vi.mocked(fetch).mockResolvedValueOnce(accepted()).mockReturnValueOnce(reply.promise);
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    rerender(second);
    let pending!: Promise<void>; act(() => { pending = result.current.begin(); });
    const pendingId = result.current.pendingStartIntentId;
    expect(pendingId).toBe(body(1).dial_intent_id);
    act(() => result.current.setConference(null));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.pendingStartIntentId).toBe(pendingId);
    await act(async () => {
      reply.resolve(Response.json({ success: true, conferenceName: "replacement-phone-room", callSid: rootB }));
      await pending;
    });
    expect(result.current.conference).toBe("replacement-phone-room");
    expect(result.current.customerCallSid).toBe(rootB);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("a confirmed stop invalidates the old reply without clearing a successor start", async () => {
    const old = deferred(), current = deferred();
    vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockResolvedValueOnce(Response.json({ success: true }));
    const { result } = renderHook(() => useStartConferenceAndDial(first));
    let previous!: Promise<void>, next!: Promise<void>;
    act(() => { previous = result.current.begin(); });
    const stoppedId = result.current.pendingStartIntentId ?? "";
    expect(stoppedId).toBe(body(0).dial_intent_id);
    act(() => { expect(result.current.confirmStartStopped(stoppedId)).toBe(true); });
    expect(result.current.pendingStartIntentId).toBeNull();
    act(() => { next = result.current.begin(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    const successorId = result.current.pendingStartIntentId;
    expect(successorId).toBe(body(1).dial_intent_id);
    expect(successorId).not.toBe(stoppedId);
    act(() => { expect(result.current.confirmStartStopped(stoppedId)).toBe(false); });
    expect(result.current.pendingStartIntentId).toBe(successorId);
    expect(result.current.isLoading).toBe(true);
    await act(async () => { old.resolve(accepted()); await previous; });
    expect(body(2)).toEqual({ callSid: rootA, workspaceId: "workspace-a" });
    expect(result.current.conference).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => { current.resolve(accepted(rootB)); await next; });
    expect(result.current.customerCallSid).toBe(rootB);
    expect(result.current.pendingStartIntentId).toBeNull();
  });
});
