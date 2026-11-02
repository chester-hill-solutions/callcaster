import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { startTransition, Suspense, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";

const first = {
  currentVerified: true, userId: "user-a", workspaceId: "10000000-0000-4000-8000-000000000001", campaignId: "42", callerId: "+15550000001", selectedDevice: "+15550000002",
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

function stopResponse(init?: RequestInit, state = "stopped") {
  const value = JSON.parse(String(init?.body));
  return Response.json({ success: true, workspace_id: value.workspaceId, user_id: first.userId, campaign_id: Number(value.campaignId),
    intent_id: value.dial_intent_id, conference_id: value.conferenceName ?? null, stop_state: state }, { status: state === "stopped" ? 200 : 202 });
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => stopResponse(init)));
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.unstubAllGlobals(); });

describe("predictive Start request and customer ownership", () => {
  test("Leave waits for current discovery, then stops the exact recovered idle session", async () => {
    const options: Parameters<typeof useStartConferenceAndDial>[0] = { ...first, currentVerified: false, dialerRecovery: null };
    const { result, rerender } = renderHook(value => useStartConferenceAndDial(value), { initialProps: options });
    await act(async () => { expect(await result.current.stop()).toBe(false); });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ ...options, currentVerified: true, dialerRecovery: { workspace_id: first.workspaceId, user_id: first.userId,
      campaign_id: 42, intent_id: "30000000-0000-4000-8000-000000000001", conference_id: "recovered-idle-room", dialer_state: "active" } });
    expect(fetch).not.toHaveBeenCalled(); expect(result.current.conference).toBe("recovered-idle-room");
    await act(async () => { expect(await result.current.stop()).toBe(true); });
    expect(body(0)).toEqual({ workspaceId: first.workspaceId, campaignId: "42", dial_intent_id: "30000000-0000-4000-8000-000000000001",
      conferenceName: "recovered-idle-room" });
  });

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

  test("a retired workspace sends its captured Stop before a new workspace Start, and ignores the old reply", async () => {
    const old = deferred(), current = deferred();
    vi.mocked(fetch).mockImplementation((url, init) => String(url) === "/api/auto-dial/end" ? Promise.resolve(stopResponse(init))
      : String(url).includes("10000000-0000-4000-8000-000000000002") ? current.promise : old.promise);
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    let previous!: Promise<void>, next!: Promise<void>;
    act(() => { previous = result.current.begin(); });
    const originalId = body(0).dial_intent_id;
    rerender({ ...second, workspaceId: "10000000-0000-4000-8000-000000000002", campaignId: "43" });
    expect(body(1)).toEqual({ workspaceId: first.workspaceId, campaignId: "42", dial_intent_id: originalId });
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.keepalive).toBe(true);
    act(() => { next = result.current.begin(); });
    await act(async () => { old.resolve(accepted()); await previous; });
    expect(result.current.conference).toBeNull(); expect(result.current.isLoading).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { current.resolve(accepted(rootB)); await next; });
    expect(result.current.customerCallSid).toBe(rootB);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).not.toContain("/api/hangup");
  });

  test("an unmounted start cannot publish a late failure toast", async () => {
    const reply = deferred(), showError = vi.fn(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const { result, unmount } = renderHook(() => useStartConferenceAndDial({ ...first, showError }));
    let pending!: Promise<void>; act(() => { pending = result.current.begin(); });
    unmount();
    await act(async () => { reply.resolve(Response.json({ error: "private provider detail" }, { status: 500 })); await pending; });
    expect(showError).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("unmount stops an unknown phone Start on its original nonce before the late accepted reply", async () => {
    const reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const { result, unmount } = renderHook(() => useStartConferenceAndDial(first));
    let pending!: Promise<void>; act(() => { pending = result.current.begin(); });
    const id = body(0).dial_intent_id; unmount();
    expect(body(1)).toEqual({ workspaceId: first.workspaceId, campaignId: first.campaignId, dial_intent_id: id });
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("X-Callcaster-Audio-Actor")).toBe(first.userId);
    await act(async () => { reply.resolve(accepted()); await pending; });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("a callback from a retired screen cannot start another workspace's customer", async () => {
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    const oldBegin = result.current.begin;
    rerender({ ...second, workspaceId: "10000000-0000-4000-8000-000000000002" });
    await act(async () => { await oldBegin(); }); expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(accepted(rootB));
    await act(async () => { await result.current.begin(); });
    expect(fetch).toHaveBeenCalledTimes(1); expect(result.current.customerCallSid).toBe(rootB);
  });

  test("a suspended scope render cannot retire the still-committed Start", async () => {
    const reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    let ready = false, resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    function Fixture() {
      const [options, setOptions] = useState(first);
      const start = useStartConferenceAndDial(options);
      if (options.workspaceId === "10000000-0000-4000-8000-000000000002" && !ready) throw gate;
      return <>
        <button onClick={() => { void start.begin(); }}>Begin</button>
        <button onClick={() => { startTransition(() => setOptions({ ...second, workspaceId: "10000000-0000-4000-8000-000000000002" })); }}>Change scope</button>
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
    expect(body(1)).toMatchObject({ workspaceId: first.workspaceId, campaignId: first.campaignId, conferenceName: "saved-phone-room" });
  });

  test("an old room-ended event cannot acknowledge a pending Stop or permit a replacement Start", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(accepted()).mockImplementationOnce(async (_url, init) => stopResponse(init, "pending"));
    const { result, rerender } = renderHook(options => useStartConferenceAndDial(options), { initialProps: first });
    await act(async () => { await result.current.begin(); });
    await act(async () => { expect(await result.current.stop()).toBe(false); });
    rerender(second); act(() => result.current.setConference(null));
    await act(async () => { await result.current.begin(); });
    expect(result.current.stopPending).toBe(true); expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { expect(await result.current.stop()).toBe(true); });
    expect(body(2)).toEqual(body(1));
    vi.mocked(fetch).mockResolvedValueOnce(accepted(rootB));
    await act(async () => { await result.current.begin(); });
    expect(result.current.customerCallSid).toBe(rootB);
    expect(body(3).dial_intent_id).not.toBe(body(0).dial_intent_id);
  });
});
