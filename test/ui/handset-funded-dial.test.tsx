import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSoftphoneController } from "@/hooks/call/useSoftphoneController";
import { mockTwilioDevice, resetTwilioVoiceSdkMock } from "../mocks/twilio-voice-sdk";
import { createMockTwilioCall } from "./hooks-test-helpers";
import { hangupCall } from "@/lib/services/hooks-api";

vi.mock("@twilio/voice-sdk", async () => import("../mocks/twilio-voice-sdk"));
vi.mock("@/lib/services/hooks-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/services/hooks-api")>(), hangupCall: vi.fn(async () => ({ success: true })),
}));

const reservationId = "10000000-0000-4000-8000-000000000001";
const response = () => new Response(JSON.stringify({ reservation_id: reservationId }), {
  status: 200, headers: { "Content-Type": "application/json" },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("handset funded browser dialing", () => {
  const fetchPreparation = vi.fn<typeof fetch>();
  const onError = vi.fn(), endSession = vi.fn(), onNavigateBack = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks(); resetTwilioVoiceSdkMock();
    fetchPreparation.mockReset().mockImplementation(async () => response());
    mockTwilioDevice.connect.mockReset().mockImplementation(async () => createMockTwilioCall());
    vi.stubGlobal("fetch", fetchPreparation);
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  async function handset() {
    const hook = renderHook(({ workspaceId, clientIdentity }) => useSoftphoneController({ token: "owned-token",
      workspaceId, clientIdentity, onError, endSession, onNavigateBack,
    }), { initialProps: { workspaceId: "workspace-one", clientIdentity: "handset-one" } });
    await waitFor(() => expect(hook.result.current.connection.device).toBeTruthy());
    act(() => hook.result.current.setOutboundTo("+16135550599"));
    return hook;
  }
  test("waits for funded preparation and ignores a second press", async () => {
    const pending = deferred<Response>(); fetchPreparation.mockReturnValueOnce(pending.promise);
    const hook = await handset();
    let dial: Promise<void>;
    act(() => { dial = hook.result.current.handleOutboundDial(); void hook.result.current.handleOutboundDial(); });
    expect(fetchPreparation).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isPreparingOutbound).toBe(true);
    expect(mockTwilioDevice.connect).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(response()); await dial; });
    expect(mockTwilioDevice.connect).toHaveBeenCalledWith({ params: {
      To: "+16135550599", workspace_id: "workspace-one", client_identity: "handset-one", credit_reservation: reservationId,
    } });
    expect(hook.result.current.callHandling.activeCall).toBeTruthy();
    expect(hook.result.current.isPreparingOutbound).toBe(false);
  });
  test("reuses the original intent after a preparation transport error", async () => {
    fetchPreparation.mockRejectedValueOnce(new Error("Owned network error"));
    const hook = await handset();
    await act(async () => { await hook.result.current.handleOutboundDial(); });
    expect(mockTwilioDevice.connect).not.toHaveBeenCalled();
    expect(hook.result.current.outboundError).toMatch(/could not prepare/i);
    await act(async () => { await hook.result.current.handleOutboundDial(); });
    const bodies = fetchPreparation.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0].dial_intent_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1].dial_intent_id).toBe(bodies[0].dial_intent_id);
    expect(mockTwilioDevice.connect).toHaveBeenCalledTimes(1);
  });
  test.each([
    { status: 402, body: { error: "Insufficient credits" } },
    { status: 200, body: { success: true } },
  ])("does not dial after invalid preparation $status", async ({ status, body }) => {
    fetchPreparation.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    const hook = await handset();
    await act(async () => { await hook.result.current.handleOutboundDial(); });
    expect(mockTwilioDevice.connect).not.toHaveBeenCalled();
    expect(hook.result.current.outboundError).toBeTruthy();
    expect(hook.result.current.isPreparingOutbound).toBe(false);
  });
  test.each(["unmount", "owner change", "end session", "incoming call"])("does not dial a delayed preparation after %s", async (exit) => {
    const pending = deferred<Response>(); fetchPreparation.mockReturnValueOnce(pending.promise);
    const hook = await handset();
    let dial: Promise<void>;
    act(() => { dial = hook.result.current.handleOutboundDial(); });
    if (exit === "unmount") hook.unmount();
    if (exit === "owner change") hook.rerender({ workspaceId: "workspace-two", clientIdentity: "handset-two" });
    if (exit === "end session") await act(async () => { await hook.result.current.handleEndSession(); });
    if (exit === "incoming call") act(() => mockTwilioDevice.emit("incoming", createMockTwilioCall({ parameters: { CallSid: "CA-incoming", To: "sip:agent" } })));
    await act(async () => { pending.resolve(response()); await dial; });
    expect(mockTwilioDevice.connect).not.toHaveBeenCalled();
  });
  test.each(["unmount", "disconnect throws", "end session"])("ends a late SDK connection after %s", async (exit) => {
    const physical = createMockTwilioCall({ parameters: { CallSid: `CA${"1".repeat(32)}`, To: "+16135550599" } });
    if (exit === "disconnect throws") physical.disconnect.mockImplementation(() => { throw new Error("Owned disconnect failure"); });
    const pending = deferred<typeof physical>(); mockTwilioDevice.connect.mockReturnValueOnce(pending.promise);
    const hook = await handset();
    let dial: Promise<void>;
    act(() => { dial = hook.result.current.handleOutboundDial(); });
    await waitFor(() => expect(mockTwilioDevice.connect).toHaveBeenCalledTimes(1));
    if (exit === "end session") await act(async () => { await hook.result.current.handleEndSession(); });
    else hook.unmount();
    await act(async () => { pending.resolve(physical); await dial; });
    expect(physical.disconnect).toHaveBeenCalled();
    expect(hangupCall).toHaveBeenCalledWith({ callSid: `CA${"1".repeat(32)}`, workspaceId: "workspace-one" });
  });
});
