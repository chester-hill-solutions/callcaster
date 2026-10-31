import { useState, useCallback, useEffect, useRef } from "react";
import { ConferenceStartRefusedError, hangupCall, startConferenceAndDial, type StartConferenceParams } from "@/lib/services/hooks-api";
import { logger } from "@/lib/logger.client";
import type { VoiceAudioSourceIdentity } from "@/lib/voice-audio-connection";
import type { PredictiveCustomerRecovery } from "@/lib/schemas/api/voice-audio";

type StartConferenceOptions = {
  userId: string;
  campaignId: string;
  workspaceId: string;
  callerId: string;
  selectedDevice: string;
  audioSource?: VoiceAudioSourceIdentity;
  showError?: (message: string, creditsError: boolean) => void;
  recovery?: PredictiveCustomerRecovery | null;
};

type StartSnapshot = {
  scope: string; conference: string | null; customerCallSid: string | null;
  creditsError: boolean; error: string | null; isLoading: boolean; awaitingReceipt: boolean; pendingStartIntentId: string | null;
};
type StartIntent = { context: string; request: StartConferenceParams & { dial_intent_id: string }; uncertain: boolean };
type StartOwner = { scope: string; active: boolean; pending: symbol | null; intent: StartIntent | null; recoveryAllowed: boolean; generation: number };
function initialStart(scope: string): StartSnapshot {
  return { scope, conference: null, customerCallSid: null, creditsError: false, error: null, isLoading: false, awaitingReceipt: false, pendingStartIntentId: null };
}

function startIntent(owner: StartOwner, request: Omit<StartConferenceParams, "dial_intent_id">) {
  const context = JSON.stringify([request.caller_id, request.selected_device, request.audioSource?.connectionId, request.audioSource?.generation]);
  // An unknown result still owns its original source, even after a selection change.
  if (!owner.intent || owner.intent.context !== context && !owner.intent.uncertain) {
    owner.intent = { context, uncertain: false, request: { ...request, dial_intent_id: crypto.randomUUID(),
      ...(request.audioSource ? { audioSource: { ...request.audioSource } } : {}) } };
  }
  return owner.intent;
}

async function endRetiredStart(result: Awaited<ReturnType<typeof startConferenceAndDial>>, workspaceId: string) {
  if (!result.success || !result.callSid) return;
  try { await hangupCall({ callSid: result.callSid, workspaceId }); }
  catch (error) { logger.error("Unable to end a retired Start customer", error); }
}

export function useStartConferenceAndDial({
  userId,
  campaignId,
  workspaceId,
  callerId,
  selectedDevice,
  audioSource,
  showError,
  recovery,
}: StartConferenceOptions) {
  const scope = JSON.stringify([userId, workspaceId, campaignId]);
  const [snapshot, setSnapshot] = useState(() => initialStart(scope));
  const ownerRef = useRef<StartOwner | null>(null);
  const current = snapshot.scope === scope ? snapshot : initialStart(scope);
  const disabledReason = current.awaitingReceipt ? null : !callerId
    ? "Set caller ID in Setup"
    : !selectedDevice
      ? "Select a device"
      : !userId || !campaignId || !workspaceId
        ? "Reload this campaign"
        : null;

  /**
   * @effect Fence asynchronous Start replies to the committed user/workspace/campaign.
   * @effect-deps scope (audio selection is not the customer call's owner).
   * @effect-side-effects retire the old request owner on scope change or unmount.
   * @effect-why-not-loader A user-started request can finish after this screen leaves; https://react.dev/learn/you-might-not-need-an-effect#fetching-data
   */
  useEffect(() => {
    const owner: StartOwner = { scope, active: true, pending: null, intent: null, recoveryAllowed: true, generation: 0 };
    ownerRef.current = owner;
    return () => { owner.active = false; };
  }, [scope]);

  const setConference = useCallback((conference: string | null) => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.scope !== scope) return;
    owner.recoveryAllowed = false; owner.generation++;
    setSnapshot(previous => {
      if (!owner.active || ownerRef.current !== owner) return previous;
      const saved = previous.scope === scope ? previous : initialStart(scope);
      return { ...saved, conference, customerCallSid: conference === saved.conference ? saved.customerCallSid : null };
    });
  }, [scope]);

  const restoreConference = useCallback((conference: string) => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.scope !== scope || !owner.recoveryAllowed || owner.pending || owner.intent) return;
    owner.recoveryAllowed = false;
    const generation = owner.generation;
    setSnapshot(previous => {
      if (!owner.active || ownerRef.current !== owner || owner.generation !== generation) return previous;
      const saved = previous.scope === scope ? previous : initialStart(scope);
      return saved.conference ? saved : { ...saved, conference };
    });
  }, [scope]);

  /**
   * @effect Adopt the saved room once for this committed screen owner.
   * @effect-deps recovery, userId, workspaceId, campaignId, restoreConference (owned read and local command fence).
   * @effect-side-effects state (retains the room after its customer ends; sends no call).
   * @effect-why-not-loader Current audio refreshes after mount; Start and Stop must permanently retire old room adoption.
   */
  useEffect(() => {
    const customer = recovery?.customer;
    if (customer?.workspace_id === workspaceId && customer.user_id === userId && String(customer.campaign_id) === campaignId)
      restoreConference(customer.conference_id);
  }, [recovery, userId, workspaceId, campaignId, restoreConference]);

  const confirmStartStopped = useCallback((intentId: string) => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.scope !== scope || owner.intent?.request.dial_intent_id !== intentId) return false;
    owner.recoveryAllowed = false; owner.generation++;
    owner.pending = null; owner.intent = null;
    setSnapshot(previous => ({ ...(previous.scope === scope ? previous : initialStart(scope)),
      isLoading: false, awaitingReceipt: false, pendingStartIntentId: null }));
    return true;
  }, [scope]);

  const begin = useCallback(async () => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.scope !== scope || owner.pending) return;
    const operation = Symbol();
    owner.pending = operation;
    const isCurrent = () => owner.active && ownerRef.current === owner && owner.pending === operation;
    const publish = (patch: Partial<Omit<StartSnapshot, "scope">>) => {
      if (!isCurrent()) return;
      setSnapshot(previous => ({ ...(previous.scope === scope ? previous : initialStart(scope)), ...patch }));
    };
    const fail = (message: string, creditFailure = false) => {
      if (!isCurrent()) return;
      publish({ error: message, creditsError: creditFailure, awaitingReceipt: owner.intent?.uncertain ?? false,
        pendingStartIntentId: owner.intent?.uncertain ? owner.intent.request.dial_intent_id : null });
      showError?.(message, creditFailure);
    };
    if (disabledReason && !owner.intent?.uncertain) {
      fail(disabledReason);
      owner.pending = null;
      return;
    }

    owner.recoveryAllowed = false; owner.generation++;

    const intent = startIntent(owner, { caller_id: callerId, workspace_id: workspaceId,
      campaign_id: campaignId, selected_device: selectedDevice, ...(audioSource ? { audioSource } : {}) });
    intent.uncertain = true;
    publish({ isLoading: true, error: null, creditsError: false, pendingStartIntentId: intent.request.dial_intent_id });
    try {
      const result = await startConferenceAndDial(intent.request);
      if (!isCurrent()) { await endRetiredStart(result, workspaceId); return; }
      if (result.creditsError) {
        intent.uncertain = false;
        fail("Insufficient credits to start dialing", true);
      } else if (result.success && result.conferenceName) {
        publish({ conference: result.conferenceName, customerCallSid: result.callSid ?? null, awaitingReceipt: false, pendingStartIntentId: null });
        owner.intent = null;
      } else {
        fail(result.error || "Could not start dialing. Try again.");
      }
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ConferenceStartRefusedError) intent.uncertain = false;
      logger.error("Conference start failed", cause);
      fail(cause instanceof Error ? cause.message : "Could not start dialing. Try again.");
    } finally {
      if (isCurrent()) { publish({ isLoading: false }); owner.pending = null; }
    }
  }, [scope, campaignId, workspaceId, callerId, selectedDevice, audioSource, disabledReason, showError]);

  return { begin, conference: current.conference, customerCallSid: current.customerCallSid, setConference, restoreConference, confirmStartStopped,
    creditsError: current.creditsError, error: current.error, isLoading: current.isLoading,
    awaitingReceipt: current.awaitingReceipt, pendingStartIntentId: current.pendingStartIntentId, disabledReason };
}
