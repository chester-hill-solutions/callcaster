import { act, renderHook } from "@testing-library/react";
import { Device } from "@twilio/voice-sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { hangupCall } from "@/lib/services/hooks-api";
import { useCustomerCallControls } from "@/hooks/call/useCustomerCallControls";
import { toast } from "sonner";
import { mockTwilioDevice, resetTwilioVoiceSdkMock } from "../mocks/twilio-voice-sdk";
import { createMockTwilioCall } from "./hooks-test-helpers";

vi.mock("@twilio/voice-sdk", async () => import("../mocks/twilio-voice-sdk"));
vi.mock("@/lib/services/hooks-api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/services/hooks-api")>()),
  hangupCall: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const firstSid = "CA22222222222222222222222222222222";
const secondSid = "CA33333333333333333333333333333333";

function mountSession() {
  const device = new Device("owned-test-token");
  const onError = vi.fn(), onStatusChange = vi.fn(), onCallStateChange = vi.fn(), onDeviceBusyChange = vi.fn();
  const hook = renderHook(({ workspaceId }) => useCallHandling({ device, workspaceId,
    onError, onStatusChange, onCallStateChange, onDeviceBusyChange }),
  { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001" } });
  return { ...hook, device, onError, onStatusChange, onCallStateChange, onDeviceBusyChange };
}

/** Allocate opaque Call fixtures through the mocked SDK's typed factory. */
async function physicalCall(device: Device, sid: string) {
  const mock = createMockTwilioCall({ parameters: { CallSid: sid, To: "+16135550123" } });
  mockTwilioDevice.connect.mockResolvedValueOnce(mock);
  return { sdk: await device.connect({ params: { To: "+16135550123" } }), mock };
}

function pendingHangup() {
  let resolve!: (value: Awaited<ReturnType<typeof hangupCall>>) => void;
  let reject!: (error: Error) => void;
  vi.mocked(hangupCall).mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no; }));
  return { accept: () => resolve({ success: true }), reject: () => reject(new Error("Original provider failure")) };
}

describe("SDK customer command lifetime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTwilioVoiceSdkMock();
    vi.mocked(hangupCall).mockReset().mockResolvedValue({ success: true });
  });

  test.each([false, true])("an old reply cannot clear a newly active call (%s)", async rejected => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid), next = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    expect(hangupCall).toHaveBeenCalledWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    act(() => s.result.current.switchTo(next.sdk));
    s.onCallStateChange.mockClear(); s.onStatusChange.mockClear();
    await act(async () => { if (rejected) reply.reject(); else reply.accept(); await pending; });
    expect(s.result.current.activeCall).toBe(next.sdk);
    expect(s.result.current.callState).toBe("connected");
    expect(next.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onCallStateChange).not.toHaveBeenCalled();
    expect(s.onStatusChange).not.toHaveBeenCalled();
  });

  test.each(["unmount", "workspace"])("a retained command cannot send after %s", async scope => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    const stale = s.result.current.hangUp;
    if (scope === "unmount") s.unmount();
    else s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" });
    await act(async () => { await stale(); });
    expect(hangupCall).not.toHaveBeenCalled();
    expect(first.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
  });

  test("a retained default Hang Up cannot target a newly active physical call", async () => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid), next = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    const stale = s.result.current.hangUp;
    act(() => s.result.current.switchTo(next.sdk));
    await act(async () => { await stale(); });
    expect(hangupCall).not.toHaveBeenCalled();
    expect(next.mock.disconnect).not.toHaveBeenCalled();
    expect(s.result.current.activeCall).toBe(next.sdk);
    expect(s.result.current.callState).toBe("connected");
  });

  test("a new pending dial retires the old reply before its SDK call is replaced", async () => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid), next = await physicalCall(s.device, secondSid);
    act(() => s.result.current.switchTo(first.sdk));
    const reply = pendingHangup();
    let oldHangup!: Promise<void>;
    act(() => { oldHangup = s.result.current.hangUp(); });
    let acceptNext!: (value: typeof next.mock) => void;
    mockTwilioDevice.connect.mockReturnValueOnce(new Promise(resolve => { acceptNext = resolve; }));
    let nextDial: ReturnType<typeof s.result.current.makeCall> = undefined;
    act(() => { nextDial = s.result.current.makeCall({ To: "+16135550124" }); });
    s.onCallStateChange.mockClear();
    await act(async () => { reply.accept(); await oldHangup; });
    expect(s.result.current.activeCall).toBe(first.sdk);
    expect(s.result.current.callState).toBe("connected");
    expect(first.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.onCallStateChange).not.toHaveBeenCalled();
    await act(async () => { acceptNext(next.mock); await nextDial; });
    expect(s.result.current.activeCall).toBe(next.sdk);
  });

  test.each([false, true])("a reply after unmount cannot clean up or notify (%s)", async rejected => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    s.unmount();
    await act(async () => { if (rejected) reply.reject(); else reply.accept(); await pending; });
    expect(first.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onCallStateChange).not.toHaveBeenCalled();
    expect(s.onStatusChange).not.toHaveBeenCalled();
    expect(s.onDeviceBusyChange).not.toHaveBeenCalled();
  });

  test.each([false, true])("a reply cannot update another workspace (%s)", async rejected => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" });
    await act(async () => { if (rejected) reply.reject(); else reply.accept(); await pending; });
    expect(first.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onCallStateChange).not.toHaveBeenCalled();
    expect(s.onStatusChange).not.toHaveBeenCalled();
    expect(s.onDeviceBusyChange).not.toHaveBeenCalled();
  });

  test("cleanup uses the current held calls instead of reviving a closed held call", async () => {
    const s = mountSession(), held = await physicalCall(s.device, firstSid), active = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(held.sdk));
    act(() => s.result.current.switchTo(active.sdk));
    expect(s.result.current.heldCalls).toEqual([held.sdk]);
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    act(() => held.mock.emit("disconnect"));
    expect(s.result.current.heldCalls).toEqual([]);
    await act(async () => { reply.accept(); await pending; });
    expect(s.result.current.activeCall).toBeNull();
    expect(s.result.current.heldCalls).toEqual([]);
    expect(s.result.current.callState).toBe("completed");
  });

  test("a matching reply restores a still-live held call", async () => {
    const s = mountSession(), held = await physicalCall(s.device, firstSid), active = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(held.sdk));
    act(() => s.result.current.switchTo(active.sdk));
    await act(async () => { await s.result.current.hangUp(); });
    expect(active.mock.disconnect).toHaveBeenCalledOnce();
    expect(held.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.result.current.activeCall).toBe(held.sdk);
    expect(s.result.current.heldCalls).toEqual([]);
    expect(s.result.current.callState).toBe("connected");
    expect(held.mock.mute).toHaveBeenLastCalledWith(false);
  });

  test("a held target promoted during Hang Up ends only that physical call", async () => {
    const s = mountSession(), held = await physicalCall(s.device, firstSid), other = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(held.sdk));
    act(() => s.result.current.switchTo(other.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(held.sdk); });
    act(() => s.result.current.switchTo(held.sdk));
    await act(async () => { reply.accept(); await pending; });
    expect(held.mock.disconnect).toHaveBeenCalledOnce();
    expect(other.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.result.current.activeCall).toBe(other.sdk);
    expect(s.result.current.heldCalls).toEqual([]);
    expect(s.result.current.callState).toBe("connected");
  });

  test("a retained closed-held command cannot send or retire a current Hang Up", async () => {
    const s = mountSession(), held = await physicalCall(s.device, firstSid), active = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(held.sdk));
    act(() => s.result.current.switchTo(active.sdk));
    const stale = s.result.current.hangUp;
    act(() => held.mock.emit("disconnect"));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    await act(async () => { await stale(held.sdk); });
    expect(hangupCall).toHaveBeenCalledExactlyOnceWith({ callSid: secondSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    await act(async () => { reply.accept(); await pending; });
    expect(s.result.current.activeCall).toBeNull();
    expect(s.result.current.callState).toBe("completed");
  });

  test("a held target that closes while Hang Up is pending cannot report against the active call", async () => {
    const s = mountSession(), held = await physicalCall(s.device, firstSid), active = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(held.sdk));
    act(() => s.result.current.switchTo(active.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(held.sdk); });
    act(() => held.mock.emit("disconnect"));
    await act(async () => { reply.reject(); await pending; });
    expect(s.result.current.activeCall).toBe(active.sdk);
    expect(s.onError).not.toHaveBeenCalled();
    expect(held.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
  });

  test("ending the active call keeps a newly arrived incoming call", async () => {
    const s = mountSession(), active = await physicalCall(s.device, firstSid), incoming = await physicalCall(s.device, secondSid);
    act(() => s.result.current.setActiveCall(active.sdk));
    const reply = pendingHangup();
    let pending!: Promise<void>;
    act(() => { pending = s.result.current.hangUp(); });
    act(() => s.result.current.receiveIncoming(incoming.sdk, true));
    expect(s.result.current.incomingCall).toBe(incoming.sdk);
    await act(async () => { reply.accept(); await pending; });
    expect(active.mock.disconnect).toHaveBeenCalledOnce();
    expect(incoming.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.result.current.incomingCall).toBe(incoming.sdk);
    expect(s.onDeviceBusyChange).toHaveBeenLastCalledWith(true);
  });

  test("a matching current acknowledgement completes its original active call", async () => {
    const s = mountSession(), first = await physicalCall(s.device, firstSid);
    act(() => s.result.current.setActiveCall(first.sdk));
    await act(async () => { await s.result.current.hangUp(); });
    expect(first.mock.disconnect).toHaveBeenCalledOnce();
    expect(s.result.current.activeCall).toBeNull();
    expect(s.result.current.callState).toBe("completed");
    expect(s.onError).not.toHaveBeenCalled();
  });

  test.each(["campaign", "softphone"])("the %s SDK resource owner still ends its original call on exit without late page updates", async owner => {
    const { useTwilioDevice } = await import("@/hooks/call/useTwilioDevice");
    const { useSoftphoneController } = await import("@/hooks/call/useSoftphoneController");
    const first = createMockTwilioCall({ parameters: { CallSid: firstSid, To: "+16135550123" } });
    mockTwilioDevice.connect.mockResolvedValueOnce(first);
    const send = vi.fn();
    const onError = vi.fn();
    const s = renderHook(() => {
      if (owner === "campaign") return useTwilioDevice({ token: "owned-test-token", selectedDevice: "computer",
        workspaceId: "10000000-0000-4000-8000-000000000001", send });
      return useSoftphoneController({ token: "owned-test-token", workspaceId: "10000000-0000-4000-8000-000000000001",
        clientIdentity: "agent", endSession: vi.fn(), onNavigateBack: vi.fn(), onError }).callHandling;
    });
    await act(async () => { await mockTwilioDevice.register(); });
    await act(async () => { await s.result.current.makeCall({ To: "+16135550123" }); });
    expect(s.result.current.activeCall).toBe(first);
    const reply = pendingHangup();
    s.unmount();
    expect(hangupCall).toHaveBeenCalledExactlyOnceWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    send.mockClear();
    await act(async () => { reply.accept(); await Promise.resolve(); });
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test.each(["campaign", "softphone"])("%s resource cleanup retains the physical call's original workspace across scope exit", async owner => {
    const { useTwilioDevice } = await import("@/hooks/call/useTwilioDevice");
    const { useSoftphoneController } = await import("@/hooks/call/useSoftphoneController");
    const first = createMockTwilioCall({ parameters: { CallSid: firstSid, To: "+16135550123" } });
    mockTwilioDevice.connect.mockResolvedValueOnce(first);
    const s = renderHook(({ workspaceId }) => {
      if (owner === "campaign") return useTwilioDevice({ token: "owned-test-token", selectedDevice: "computer", workspaceId, send: vi.fn() });
      return useSoftphoneController({ token: "owned-test-token", workspaceId, clientIdentity: "agent", endSession: vi.fn(), onNavigateBack: vi.fn(), onError: vi.fn() }).callHandling;
    },
      { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001" } });
    await act(async () => { await mockTwilioDevice.register(); });
    await act(async () => { await s.result.current.makeCall({ To: "+16135550123" }); });
    const reply = pendingHangup();
    s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" });
    expect(hangupCall).toHaveBeenCalledExactlyOnceWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    await act(async () => { reply.accept(); await Promise.resolve(); });
    s.unmount();
    expect(hangupCall).toHaveBeenCalledOnce();
    expect(first.disconnect).toHaveBeenCalledOnce();
  });

  test("an acknowledged customer end stays successful when SDK disconnect throws", async () => {
    const device = new Device("owned-test-token"), first = await physicalCall(device, firstSid);
    first.mock.disconnect.mockImplementation(() => { throw new Error("Signaling transport closed"); });
    const confirmCustomerEnded = vi.fn(() => true);
    const s = renderHook(() => useCustomerCallControls({ userId: "user-1", workspaceId: "10000000-0000-4000-8000-000000000001", campaignId: 1,
      callSid: "CA44444444444444444444444444444444", isPredictive: false, activeCall: first.sdk,
      sdkHangUp: vi.fn(), send: vi.fn(), isCurrentCustomer: () => true, confirmCustomerEnded, managesCustomerAudio: () => false }));
    await act(async () => { await s.result.current.hangUp(); });
    expect(hangupCall).toHaveBeenCalledExactlyOnceWith({ callSid: "CA44444444444444444444444444444444", workspaceId: "10000000-0000-4000-8000-000000000001" });
    expect(confirmCustomerEnded).toHaveBeenCalledOnce();
    expect(first.mock.disconnect).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
