import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { PredictiveDialer } from "@/lib/predictive-dialer";
import type { VoiceAudioSourceIdentity } from "@/lib/voice-audio-connection";
import type { PredictiveCustomerRecovery } from "@/lib/schemas/api/voice-audio";
import type { VoiceDialerCurrent } from "@/lib/schemas/api/voice-dialer-stop";

type StartConferenceOptions = {
  userId: string; campaignId: string; workspaceId: string; callerId: string; selectedDevice: string;
  audioSource?: VoiceAudioSourceIdentity; showError?: (message: string, creditsError: boolean) => void;
  recovery?: PredictiveCustomerRecovery | null; dialerRecovery?: VoiceDialerCurrent | null;
  currentVerified?: boolean;
};

export function useStartConferenceAndDial({ userId, campaignId, workspaceId, callerId, selectedDevice,
  audioSource, showError, recovery, dialerRecovery, currentVerified = false }: StartConferenceOptions) {
  const resource = useMemo(() => new PredictiveDialer({ userId, campaignId, workspaceId }, {
    getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value),
  }), [userId, campaignId, workspaceId]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  /**
   * @effect Own the saved Start and Stop journal for this committed screen.
   * @effect-deps resource (actor, workspace and campaign).
   * @effect-side-effects Read browser storage; cleanup saves and sends the exact Stop, never another Start.
   * @effect-why-not-loader Browser request recovery and unmount cleanup require a committed lifetime.
   * See https://react.dev/learn/synchronizing-with-effects.
   */
  useEffect(() => resource.mount(), [resource]);
  /**
   * @effect Recover the saved session control, including an idle conference.
   * @effect-deps resource, dialerRecovery, currentVerified, recovery, userId, workspaceId, campaignId.
   * @effect-side-effects Adopt an exact server control; retry only an already requested Stop.
   * @effect-why-not-loader The audio current read refreshes after mount and must respect local command fences.
   */
  useEffect(() => {
    resource.recover(dialerRecovery ?? null, currentVerified);
    const customer = recovery?.customer;
    if (customer?.workspace_id === workspaceId && customer.user_id === userId && String(customer.campaign_id) === campaignId)
      resource.restoreConference(customer.conference_id);
  }, [resource, dialerRecovery, currentVerified, recovery, userId, workspaceId, campaignId]);
  const disabledReason = state.stopPending || state.hasSession && !state.conference && !state.awaitingReceipt ? "Stop this session before starting another"
    : state.awaitingReceipt ? null : !state.currentVerified && !state.hasSession ? "Check current dialing session" : !callerId
    ? "Set caller ID in Setup" : !selectedDevice ? "Select a device" : !userId || !campaignId || !workspaceId ? "Reload this campaign" : null;
  const begin = useCallback(() => resource.begin({ caller_id: callerId, workspace_id: workspaceId, campaign_id: campaignId,
    selected_device: selectedDevice, ...(audioSource ? { audioSource } : {}) }, disabledReason, showError),
  [resource, callerId, workspaceId, campaignId, selectedDevice, audioSource, disabledReason, showError]);
  return { ...state, begin, setConference: resource.setConference, restoreConference: resource.restoreConference,
    stop: resource.stop, disabledReason };
}
