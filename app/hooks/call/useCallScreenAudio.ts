import { useCallback } from "react";
import type { useAgentAudioConnection } from "@/hooks/call/useAgentAudioConnection";
import type { CallingDeviceFieldProps } from "@/components/call/CallScreen.DeviceSettings";

type AudioScreenOptions = {
  audio: ReturnType<typeof useAgentAudioConnection>;
  hasJoined: boolean; workspaceId: string; verifiedNumbers: string[];
  customerSid: string | null; agentSid: string | null; customerPending: boolean;
  browserEnabled: boolean; browserError: string | null;
  requestMicrophone: () => Promise<void>; reconnect: () => void;
};

export function agentAudioStartReason({ joined, ready, pendingCustomer, selectedDevice, deviceStatus, hasPhoneSource }: {
  joined: boolean; ready: boolean; pendingCustomer: boolean; selectedDevice: string; deviceStatus: string; hasPhoneSource: boolean;
}) {
  if (!joined) return "Join this campaign";
  if (pendingCustomer) return "Check call request";
  if (!ready) return "Check audio connection";
  if (selectedDevice === "computer" && deviceStatus !== "Registered") return "Connect computer audio";
  if (selectedDevice !== "computer" && !hasPhoneSource) return "Connect phone audio";
  return null;
}

export function useCallScreenAudio({ audio, hasJoined, workspaceId, verifiedNumbers, customerSid, agentSid,
  customerPending, browserEnabled, browserError, requestMicrophone, reconnect }: AudioScreenOptions) {
  const { resource, state } = audio;
  const busy = state.restoring || Boolean(state.pendingDevice) || state.preparingBrowser;
  const onSelect = useCallback((target: string) => {
    if (busy || customerPending || !hasJoined) return;
    const sourceSid = state.active?.callSid ?? agentSid;
    if (customerSid && !sourceSid) return;
    const live = customerSid && sourceSid ? { callSid: customerSid, expected_agent_sid: sourceSid } : {};
    const identity = { workspaceId, connection_intent_id: crypto.randomUUID(), ...live };
    if (target === "computer") {
      if (state.selectedDevice !== "computer") resource.prepareBrowser(customerSid ? { ...identity, device: "computer" } : undefined);
    } else if (verifiedNumbers.includes(target)) void resource.begin({ ...identity, phoneNumber: target });
  }, [resource, state, busy, customerPending, hasJoined, workspaceId, verifiedNumbers, customerSid, agentSid]);

  const controls: CallingDeviceFieldProps["audioConnection"] = {
    pendingDevice: state.pendingDevice, busy: busy || customerPending,
    error: state.error ?? (state.preparingBrowser ? browserError : null), cancelRequested: state.cancelRequested,
    canCancel: Boolean(state.pendingDevice) || state.preparingBrowser,
    browserEnabled,
    onRetry: () => {
      if (state.preparingBrowser) { reconnect(); void requestMicrophone(); }
      else void resource.retry();
    },
    onCancel: () => { resource.cancelBrowserPreparation(); void resource.cancel(); },
  };
  const phoneConnectionStatus: CallingDeviceFieldProps["phoneStatus"] = state.pendingDevice || state.preparingBrowser ? "connecting" : state.active ? "connected" : "disconnected";
  return { onSelect, controls, phoneConnectionStatus };
}
