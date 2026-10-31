import { act, renderHook, waitFor } from "@testing-library/react";
import { startTransition, Suspense } from "react";
import { flushSync } from "react-dom";
import { Device, type Call } from "@twilio/voice-sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { hangupCall, prepareHandsetDial } from "@/lib/services/hooks-api";
import { useSoftphoneController } from "@/hooks/call/useSoftphoneController";
import { useSoftphoneSessionEnd } from "@/hooks/call/useSoftphoneSessionEnd";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { mockTwilioDevice, resetTwilioVoiceSdkMock } from "../mocks/twilio-voice-sdk";
import { createMockTwilioCall } from "./hooks-test-helpers";

const replacement = vi.hoisted(() => ({ enabled: false }));
vi.mock("@twilio/voice-sdk", async () => {
  const sdk = await import("../mocks/twilio-voice-sdk");
  const { createMockTwilioDevice } = await import("./hooks-test-helpers");
  return { ...sdk, Device: class extends sdk.Device {
    constructor(token: string, options?: unknown) {
      super(token, options);
      if (replacement.enabled) return createMockTwilioDevice();
    }
  } };
});
vi.mock("@/lib/services/hooks-api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/services/hooks-api")>()),
  hangupCall: vi.fn(),
  prepareHandsetDial: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const firstSid = "CA22222222222222222222222222222222";
const secondSid = "CA33333333333333333333333333333333";

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

async function mountController() {
  const endSession = vi.fn(), onNavigateBack = vi.fn(), onError = vi.fn();
  const s = renderHook(({ workspaceId }) => useSoftphoneController({ token: "owned-test-token", workspaceId,
    clientIdentity: "agent", endSession, onNavigateBack, onError }),
    { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001" } });
  await act(async () => { await mockTwilioDevice.register(); });
  return { ...s, endSession, onNavigateBack, onError };
}

describe("Softphone session end", () => {
  beforeEach(() => {
    vi.clearAllMocks(); resetTwilioVoiceSdkMock();
    replacement.enabled = false;
    mockTwilioDevice.calls = [];
    vi.mocked(hangupCall).mockReset().mockResolvedValue({ success: true });
    vi.mocked(prepareHandsetDial).mockReset().mockResolvedValue("10000000-0000-4000-8000-000000000099");
    mockTwilioDevice.connect.mockReset().mockImplementation(async () => createMockTwilioCall());
  });

  test.each(["workspace", "identity", "unmount"])("session-end ownership: a late reply cannot close a retired %s", async scope => {
    const { useSoftphoneController } = await import("@/hooks/call/useSoftphoneController");
    const endSession = vi.fn(), onNavigateBack = vi.fn();
    const s = renderHook(({ workspaceId, clientIdentity }) => useSoftphoneController({ token: "owned-test-token", workspaceId,
      clientIdentity, endSession, onNavigateBack, onError: vi.fn() }),
      { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001", clientIdentity: "agent" } });
    await act(async () => { await mockTwilioDevice.register(); });
    const first = await physicalCall(new Device("owned-test-token"), firstSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    expect(hangupCall).toHaveBeenCalledExactlyOnceWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    if (scope === "unmount") s.unmount();
    else s.rerender({ workspaceId: scope === "workspace" ? "10000000-0000-4000-8000-000000000002" : "10000000-0000-4000-8000-000000000001",
      clientIdentity: scope === "identity" ? "other-agent" : "agent" });
    await act(async () => { reply.accept(); await pending; });
    expect(endSession).not.toHaveBeenCalled();
    expect(onNavigateBack).not.toHaveBeenCalled();
  });

  test("session-end ownership: a retained end command cannot close a new workspace", async () => {
    const { useSoftphoneController } = await import("@/hooks/call/useSoftphoneController");
    const endSession = vi.fn(), onNavigateBack = vi.fn();
    const s = renderHook(({ workspaceId }) => useSoftphoneController({ token: "owned-test-token", workspaceId,
      clientIdentity: "agent", endSession, onNavigateBack, onError: vi.fn() }),
      { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001" } });
    await act(async () => { await mockTwilioDevice.register(); });
    const retained = s.result.current.handleEndSession;
    s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" });
    await act(async () => { await retained(); });
    expect(endSession).not.toHaveBeenCalled();
    expect(onNavigateBack).not.toHaveBeenCalled();
    expect(hangupCall).not.toHaveBeenCalled();
  });

  test("session-end ownership: the current session still ends after its own customer reply", async () => {
    const { useSoftphoneController } = await import("@/hooks/call/useSoftphoneController");
    const endSession = vi.fn(), onNavigateBack = vi.fn();
    const s = renderHook(() => useSoftphoneController({ token: "owned-test-token", workspaceId: "10000000-0000-4000-8000-000000000001",
      clientIdentity: "agent", endSession, onNavigateBack, onError: vi.fn() }));
    await act(async () => { await mockTwilioDevice.register(); });
    const first = await physicalCall(new Device("owned-test-token"), firstSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    expect(endSession).not.toHaveBeenCalled();
    await act(async () => { reply.accept(); await pending; });
    expect(endSession).toHaveBeenCalledOnce();
    expect(onNavigateBack).toHaveBeenCalledOnce();
  });

  test("a retained end command cannot end a different rendered call set", async () => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid), next = await physicalCall(new Device("owned-test-token"), secondSid);
    act(() => s.result.current.callHandling.switchTo(first.sdk));
    const retained = s.result.current.handleEndSession;
    act(() => s.result.current.callHandling.switchTo(next.sdk));
    const third = createMockTwilioCall({ parameters: { CallSid: "CA44444444444444444444444444444444", To: "+16135550125" } });
    let connected!: (value: typeof third) => void;
    mockTwilioDevice.connect.mockReturnValueOnce(new Promise(resolve => { connected = resolve; }));
    let dialing: ReturnType<typeof s.result.current.callHandling.makeCall>;
    act(() => { dialing = s.result.current.callHandling.makeCall({ To: "+16135550125" }); });
    await act(async () => { await retained(); });
    expect(hangupCall).not.toHaveBeenCalled();
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(next.mock.disconnect).not.toHaveBeenCalled();
    await act(async () => { connected(third); await dialing; });
    expect(s.result.current.callHandling.activeCall).toBe(third);
    expect(third.disconnect).not.toHaveBeenCalled();
  });

  test.each(["active", "incoming"])("a new %s call survives a late session-end reply", async role => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid), next = await physicalCall(new Device("owned-test-token"), secondSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    expect(hangupCall).toHaveBeenCalledWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    act(() => { if (role === "active") s.result.current.callHandling.switchTo(next.sdk); else s.result.current.callHandling.receiveIncoming(next.sdk); });
    await act(async () => { reply.accept(); await pending; });
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(next.mock.disconnect).not.toHaveBeenCalled();
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(role === "active" ? s.result.current.callHandling.activeCall : s.result.current.callHandling.incomingCall).toBe(next.sdk);
    if (role === "incoming") {
      act(() => { s.result.current.callHandling.clearIncomingCall(); s.result.current.setOutboundTo("+16135550124"); });
      await act(async () => { await s.result.current.handleOutboundDial(); });
      expect(prepareHandsetDial).toHaveBeenCalledOnce();
    }
  });

  test("a retained end command cannot cancel a newer funded preparation", async () => {
    const s = await mountController(), retained = s.result.current.handleEndSession;
    let prepared!: (value: string) => void;
    vi.mocked(prepareHandsetDial).mockReturnValueOnce(new Promise(resolve => { prepared = resolve; }));
    act(() => s.result.current.setOutboundTo("+16135550124"));
    let dialing!: Promise<void>;
    act(() => { dialing = s.result.current.handleOutboundDial(); });
    expect(prepareHandsetDial).toHaveBeenCalledOnce();
    await act(async () => { await retained(); });
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(s.result.current.isPreparingOutbound).toBe(true);
    await act(async () => { prepared("10000000-0000-4000-8000-000000000099"); await dialing; });
    expect(mockTwilioDevice.connect).toHaveBeenCalledOnce();
    expect(s.result.current.callHandling.activeCall).toBeTruthy();
  });

  test("repeated End Session presses share the first pending end", async () => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    await act(async () => { await s.result.current.handleEndSession(); });
    expect(hangupCall).toHaveBeenCalledOnce();
    expect(s.endSession).not.toHaveBeenCalled();
    await act(async () => { reply.accept(); await pending; });
    expect(s.endSession).toHaveBeenCalledOnce();
    expect(s.onNavigateBack).toHaveBeenCalledOnce();
  });

  test("an exception after scope exit cannot disconnect or close the newer session", async () => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    s.onError.mockImplementationOnce(() => {
      s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" });
      throw new Error("Original session feedback failed");
    });
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    await act(async () => { reply.reject(); await pending; });
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
  });

  test("the current end closes its held and active calls before leaving", async () => {
    const s = await mountController(), held = await physicalCall(new Device("owned-test-token"), firstSid), active = await physicalCall(new Device("owned-test-token"), secondSid);
    act(() => s.result.current.callHandling.setActiveCall(held.sdk));
    act(() => s.result.current.callHandling.switchTo(active.sdk));
    await act(async () => { await s.result.current.handleEndSession(); });
    expect(hangupCall).toHaveBeenCalledWith({ callSid: firstSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    expect(hangupCall).toHaveBeenCalledWith({ callSid: secondSid, workspaceId: "10000000-0000-4000-8000-000000000001" });
    expect(held.mock.disconnect).toHaveBeenCalled(); expect(active.mock.disconnect).toHaveBeenCalled();
    expect(s.endSession).toHaveBeenCalledOnce(); expect(s.onNavigateBack).toHaveBeenCalledOnce();
  });

  test("a replacement SDK device survives the original session-end reply", async () => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const original = s.result.current.connection.device, reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    replacement.enabled = true;
    act(() => s.result.current.connection.reconnect());
    await waitFor(() => {
      expect(s.result.current.connection.device).not.toBeNull();
      expect(s.result.current.connection.device).not.toBe(original);
    });
    const current = s.result.current.connection.device;
    expect(current).not.toBeNull();
    await act(async () => { reply.accept(); await pending; });
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(current?.disconnectAll).not.toHaveBeenCalled();
  });

  test("a pending SDK incoming call survives before React receives its event", async () => {
    const s = await mountController(), first = await physicalCall(new Device("owned-test-token"), firstSid), next = await physicalCall(new Device("owned-test-token"), secondSid);
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.handleEndSession(); });
    mockTwilioDevice.calls = [next.sdk];
    expect(s.result.current.incomingCall).toBeNull();
    await act(async () => { reply.accept(); await pending; });
    expect(mockTwilioDevice.disconnectAll).not.toHaveBeenCalled();
    expect(next.mock.disconnect).not.toHaveBeenCalled();
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
  });

  test("an uncommitted workspace render does not retire the current end request", async () => {
    const device = new Device("owned-test-token"), first = await physicalCall(device, firstSid);
    const endSession = vi.fn(), onNavigateBack = vi.fn(), onError = vi.fn(), blockOutbound = vi.fn(() => vi.fn());
    const blocked = new Promise<never>(() => {});
    const s = renderHook(({ workspaceId }) => {
      const callHandling = useCallHandling({ device, workspaceId, onError });
      const end = useSoftphoneSessionEnd({ workspaceId, clientIdentity: "agent", device, callHandling,
        isPreparingOutbound: false, blockOutbound, endSession, onNavigateBack, onError: vi.fn() });
      if (workspaceId === "10000000-0000-4000-8000-000000000002") throw blocked;
      return { callHandling, end };
    }, { initialProps: { workspaceId: "10000000-0000-4000-8000-000000000001" },
      wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense> });
    act(() => s.result.current.callHandling.setActiveCall(first.sdk));
    const reply = pendingHangup(); let pending!: Promise<void>;
    act(() => { pending = s.result.current.end(); });
    act(() => startTransition(() => s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" })));
    await act(async () => { reply.accept(); await pending; });
    expect(endSession).toHaveBeenCalledOnce();
    expect(onNavigateBack).toHaveBeenCalledOnce();
    expect(blockOutbound).toHaveBeenCalledOnce();
  });

  test("a retained command cannot close a session after unmount", async () => {
    const s = await mountController(), retained = s.result.current.handleEndSession;
    s.unmount();
    await act(async () => { await retained(); });
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(hangupCall).not.toHaveBeenCalled();
  });

  test("a retained command cannot end a replacement device before sending", async () => {
    const s = await mountController(), retained = s.result.current.handleEndSession, original = s.result.current.connection.device;
    replacement.enabled = true;
    act(() => s.result.current.connection.reconnect());
    await waitFor(() => {
      expect(s.result.current.connection.device).not.toBeNull();
      expect(s.result.current.connection.device).not.toBe(original);
    });
    const current = s.result.current.connection.device;
    if (!current) throw new Error("Replacement SDK device required");
    const next = await current.connect({ params: { To: "+16135550125" } });
    const disconnect = vi.spyOn(next, "disconnect");
    let connected!: (value: Call) => void;
    vi.spyOn(current, "connect").mockReturnValueOnce(new Promise(resolve => { connected = resolve; }));
    let dialing: ReturnType<typeof s.result.current.callHandling.makeCall>;
    act(() => { dialing = s.result.current.callHandling.makeCall({ To: "+16135550125" }); });
    await act(async () => { await retained(); });
    expect(s.endSession).not.toHaveBeenCalled();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
    expect(s.result.current.connection.device?.disconnectAll).not.toHaveBeenCalled();
    await act(async () => { connected(next); await dialing; });
    expect(s.result.current.callHandling.activeCall).toBe(next);
    expect(disconnect).not.toHaveBeenCalled();
  });

  test("session completion cannot navigate after its callback changes the owner", async () => {
    const s = await mountController();
    s.endSession.mockImplementationOnce(() => flushSync(() => s.rerender({ workspaceId: "10000000-0000-4000-8000-000000000002" })));
    await act(async () => { await s.result.current.handleEndSession(); });
    expect(s.endSession).toHaveBeenCalledOnce();
    expect(s.onNavigateBack).not.toHaveBeenCalled();
  });
});
