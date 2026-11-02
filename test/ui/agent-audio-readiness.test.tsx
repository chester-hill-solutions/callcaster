import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Device } from "@twilio/voice-sdk";
import { AgentAudioConnection } from "@/lib/agent-audio-connection";
import { useCallAudioControls } from "@/hooks/call/useCallAudioControls";
import { useAgentBrowserReadiness } from "@/hooks/call/useAgentAudioConnection";

vi.mock("@/lib/logger.client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/logger.client")>(),
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
afterEach(() => vi.unstubAllGlobals());

describe("phone to browser readiness", () => {
  test.each(["resolve", "reject"])("SDK input can %s only after registration without an early phone stop", async outcome => {
    const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "agent" };
    const request = { workspaceId: owner.workspaceId, phoneNumber: "+16135550123", connection_intent_id: "20000000-0000-4000-8000-000000000001" };
    const audio = { connection_id: "30000000-0000-4000-8000-000000000001", workspace_id: owner.workspaceId, user_id: owner.userId,
      connection_intent_id: request.connection_intent_id, control_intent_id: request.connection_intent_id, connection_state: "active", generation: 1,
      callSid: `CA${"1".repeat(32)}`, requested_call_sid: null, source_agent_sid: null, campaign_id: null, destination: request.phoneNumber, transport: "phone", cancel_requested: false };
    const envelope = { workspace_id: owner.workspaceId, user_id: owner.userId, connection_intent_id: request.connection_intent_id,
      request: { transport: "phone", destination: request.phoneNumber, callSid: null, expectedAgentSid: null, campaignId: null } };
    let connected = false, stopped = false;
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("current=1")) return Response.json({ workspace_id: owner.workspaceId, user_id: owner.userId,
        active: connected && !stopped ? { ...envelope, intent_state: "bound", connection: audio } : null,
        pending: null, recovery_required: false, customer_pending: false, predictive: { revision: "0", customer: null } });
      if (options.method === "POST") { connected = true; return Response.json({ success: true, ...audio }); }
      if (options.method === "DELETE") stopped = true;
      return Response.json(options.method === "DELETE" ? { ...envelope, intent_state: "canceled", connection: { ...audio, connection_state: "canceled", cancel_requested: true } }
        : { ...envelope, intent_state: "bound", connection: audio });
    });
    vi.stubGlobal("fetch", fetcher);
    const storage = new Map<string, string>();
    const resource = new AgentAudioConnection(owner, { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } });
    const dispose = resource.mount(); await resource.refresh(); await resource.begin(request); resource.prepareBrowser();
    let resolve: () => void = () => undefined, reject: (error: Error) => void = () => undefined;
    const input = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    const setInputDevice = vi.fn(() => input);
    const device = { audio: { setInputDevice, unsetInputDevice: vi.fn(async () => {}), speakerDevices: { set: vi.fn(async () => {}) } } } as unknown as Device;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      enumerateDevices: vi.fn(async () => [{ kind: "audioinput", deviceId: "mic", label: "Microphone" }]),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } });
    vi.stubGlobal("AudioContext", class { close = vi.fn(); });
    const { result, rerender, unmount } = renderHook(({ registered }) => {
      const controls = useCallAudioControls({ device, activeCall: null, micCoordinator: { isMicMuted: false, setMicMuted: vi.fn() } });
      useAgentBrowserReadiness(resource, true, registered, controls.inputReady);
      return controls;
    }, { initialProps: { registered: false } });
    try {
      await waitFor(() => expect(setInputDevice).toHaveBeenCalledWith("mic"));
      expect(result.current.inputReady).toBe(false);
      expect(fetcher.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
      await act(async () => { if (outcome === "resolve") resolve(); else reject(new Error("Input failed")); });
      expect(fetcher.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
      expect(resource.getSnapshot().selectedDevice).toBe(request.phoneNumber);
      rerender({ registered: true });
      if (outcome === "resolve") await waitFor(() => expect(resource.getSnapshot().selectedDevice).toBe("computer"));
      else {
        expect(resource.getSnapshot().selectedDevice).toBe(request.phoneNumber);
        expect(result.current.inputError).toMatch(/microphone could not connect/);
      }
      expect(fetcher.mock.calls.filter(call => call[1].method === "DELETE")).toHaveLength(outcome === "resolve" ? 1 : 0);
    } finally { unmount(); dispose(); }
  });
});
