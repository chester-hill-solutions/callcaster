import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import type { useCallHandling } from "./useCallHandling";

type Owner = { workspaceId: string; clientIdentity: string; active: boolean; epoch: number; pending: object | null };
type EndView = { owner: Owner; device: Device | null; calls: Set<Call>; callState: string; preparing: boolean };
type Options = {
  workspaceId: string;
  clientIdentity: string;
  device: Device | null;
  callHandling: Pick<ReturnType<typeof useCallHandling>, "activeCall" | "incomingCall" | "heldCalls" | "callState" | "hangUp" | "cancelPendingDial">;
  isPreparingOutbound: boolean;
  blockOutbound: () => () => void;
  endSession: () => void;
  onNavigateBack: () => void;
  onError: (message: string) => void;
};

function matchesRenderedEnd(view: EndView, current: EndView) {
  const calls = new Set([...current.calls, ...(current.device?.calls ?? [])]);
  return view.owner.active && !view.owner.pending && current.owner === view.owner && current.device === view.device &&
    current.preparing === view.preparing && current.callState === view.callState &&
    calls.size === view.calls.size && [...calls].every(call => view.calls.has(call));
}

/** An end command retains its committed session and physical call set. */
export function useSoftphoneSessionEnd({ workspaceId, clientIdentity, device, callHandling,
  isPreparingOutbound, blockOutbound, endSession, onNavigateBack, onError }: Options) {
  const owner = useMemo<Owner>(() => ({ workspaceId, clientIdentity, active: false, epoch: 0, pending: null }), [workspaceId, clientIdentity]);
  const { activeCall, incomingCall, heldCalls, callState, hangUp, cancelPendingDial } = callHandling;
  const view = useMemo(() => ({ owner, device, activeCall, heldCalls, callState, hangUp, cancelPendingDial, preparing: isPreparingOutbound,
    calls: new Set<Call>([...heldCalls, ...(activeCall ? [activeCall] : []), ...(incomingCall ? [incomingCall] : []), ...(device?.calls ?? [])]),
  }), [owner, device, activeCall, incomingCall, heldCalls, callState, hangUp, cancelPendingDial, isPreparingOutbound]);
  const latest = useRef(view);

  /**
   * @effect Own session-end commands through the committed handset identity.
   * @effect-deps owner (workspace and client identity select a new lifetime).
   * @effect-side-effects Retire commands and replies on cleanup; no provider commands.
   * @effect-why-not-loader An asynchronous SDK command can outlive the session that issued it.
   */
  useLayoutEffect(() => {
    owner.active = true; owner.epoch++;
    return () => { owner.active = false; owner.epoch++; owner.pending = null; };
  }, [owner]);

  /**
   * @effect Save the committed physical call and preparation view for end checks.
   * @effect-deps view (the current SDK device, calls, dial state and session owner).
   * @effect-side-effects none (updates only the committed snapshot reference).
   * @effect-why-not-loader Speculative renders must not retire or retarget a running SDK command.
   */
  useLayoutEffect(() => { latest.current = view; }, [view]);

  return useCallback(async () => {
    if (!matchesRenderedEnd(view, latest.current)) return;
    const epoch = owner.epoch, operation = {};
    owner.pending = operation;
    const releaseOutbound = blockOutbound();
    const isCurrent = () => owner.active && owner.epoch === epoch && owner.pending === operation &&
      latest.current.owner === owner && latest.current.device === view.device &&
      !(latest.current.callState === "dialing" && view.callState !== "dialing") &&
      [...latest.current.calls, ...(latest.current.device?.calls ?? [])].every(call => view.calls.has(call));
    let finished = false;
    try {
      latest.current.cancelPendingDial();
      const targets = new Set([...view.heldCalls, ...(view.activeCall ? [view.activeCall] : [])]);
      for (const target of targets) {
        if (!isCurrent()) return;
        await latest.current.hangUp(target);
      }
      if (!isCurrent()) return;
      endSession();
      if (!isCurrent()) return;
      onNavigateBack();
      finished = true;
    } catch (error) {
      if (isCurrent()) onError(error instanceof Error ? error.message : "Could not end the session. Try again.");
    } finally {
      if (!finished && owner.pending === operation) {
        owner.pending = null;
        if (owner.active && owner.epoch === epoch && latest.current.owner === owner) releaseOutbound();
      }
    }
  }, [owner, view, blockOutbound, endSession, onNavigateBack, onError]);
}
