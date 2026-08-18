import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { hangupCall } from "@/lib/services/hooks-api";
import { logger } from "@/lib/logger.client";
import { attachCallListener } from "@/lib/twilio/call-listener-utils.client";
import {
  deriveCallSessionPhase,
  type CallSessionPhase,
} from "@/lib/twilio/call-session-types";
import {
  setCallMuted,
  getCallSid,
  logTwilioAdapterResult,
} from "@/lib/twilio/twilio-call-adapter.client";

interface CallConnectParams {
  To: string;
  [key: string]: string;
}

interface UseCallHandlingOptions {
  device: Device | null;
  workspaceId: string;
  /** Optional external incoming call source (tests / legacy prop sync). */
  incomingCall?: Call | null;
  /** If true, incoming calls where To contains "client" are accepted immediately. */
  autoAcceptIncoming?: boolean;
  onCallStateChange?: (callState: string) => void;
  onActiveCallChange?: (call: Call | null) => void;
  onIncomingCallChange?: (call: Call | null) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onDeviceBusyChange?: (isBusy: boolean) => void;
}

interface UseCallHandlingReturn {
  activeCall: Call | null;
  /** Calls connected but locally suspended (SDK mute), not conference hold. */
  heldCalls: Call[];
  incomingCall: Call | null;
  callState: string;
  sessionPhase: CallSessionPhase;
  /** Operator muted mic — independent of hold state. */
  isMicMuted: boolean;
  /** Active call is locally suspended via SDK mute (not conference hold). */
  isActiveCallOnLocalHold: boolean;
  makeCall: (params: CallConnectParams) => void;
  hangUp: (call?: Call) => Promise<void>;
  answer: () => void;
  holdAndAnswer: () => void;
  switchTo: (call: Call) => void;
  holdActiveCall: () => void;
  resumeActiveCall: () => void;
  /** Toggle operator mic mute without entering hold. */
  setMicMuted: (muted: boolean) => void;
  receiveIncoming: (call: Call, suppressConnectedState?: boolean) => void;
  clearIncomingCall: () => void;
  /** Test-only: direct session mutation. */
  setActiveCall: (call: Call | null) => void;
}

function applyAgentLegMute(call: Call, muted: boolean): void {
  const result = setCallMuted(call, muted);
  logTwilioAdapterResult(result, "setCallMuted");
}

function suspendHeldCall(call: Call): void {
  applyAgentLegMute(call, true);
}

/**
 * Canonical owner of Twilio Voice SDK call session state for a single device.
 */
export function useCallHandling({
  device,
  workspaceId,
  incomingCall: externalIncomingCall = null,
  autoAcceptIncoming = false,
  onCallStateChange,
  onActiveCallChange,
  onIncomingCallChange,
  onStatusChange,
  onError,
  onDeviceBusyChange,
}: UseCallHandlingOptions): UseCallHandlingReturn {
  const [activeCall, setActiveCallState] = useState<Call | null>(null);
  const [heldCalls, setHeldCalls] = useState<Call[]>([]);
  const [incomingCall, setIncomingCallState] = useState<Call | null>(
    externalIncomingCall ?? null,
  );
  const [callState, setCallState] = useState<string>("idle");
  const [isActiveCallOnLocalHold, setIsActiveCallOnLocalHold] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);

  const incomingCallRef = useRef<Call | null>(externalIncomingCall ?? null);
  const previousExternalIncomingRef = useRef<Call | null>(externalIncomingCall ?? null);
  const heldCallsRef = useRef<Call[]>([]);
  const activeCallRef = useRef<Call | null>(null);
  const isMicMutedRef = useRef(false);
  const isOnLocalHoldRef = useRef(false);
  const incomingListenerCleanupsRef = useRef<Map<Call, () => void>>(new Map());
  const callGenerationRef = useRef(0);

  /**
   * @effect Mirror `heldCalls` state into a ref so callbacks/other effects
   * (e.g. hangUp, the active-call listener effect) can read the current held
   * calls without needing to be recreated/resubscribed on every change.
   * @effect-deps heldCalls (re-syncs the ref whenever the held-calls list changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern for use in
   * imperative SDK callbacks below.
   */
  useEffect(() => {
    heldCallsRef.current = heldCalls;
  }, [heldCalls]);
  /**
   * @effect Mirror `activeCall` state into a ref for the same reason as
   * heldCallsRef above — callbacks like hangUp/answer/switchTo read the
   * current active call synchronously without depending on (and thus
   * recreating on) every activeCall change.
   * @effect-deps activeCall (re-syncs the ref whenever the active call changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern.
   */
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  /**
   * @effect Mirror `incomingCall` state into a ref so callbacks (answer,
   * clearIncomingCall) can read the current incoming call synchronously.
   * @effect-deps incomingCall (re-syncs the ref whenever the incoming call changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern.
   */
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);
  /**
   * @effect Mirror `isMicMuted` state into a ref so syncAgentLegMute/setMicMuted
   * can read the current mute flag without depending on it directly.
   * @effect-deps isMicMuted (re-syncs the ref whenever the mute flag changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern.
   */
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);
  /**
   * @effect Mirror `isActiveCallOnLocalHold` state into a ref so
   * syncAgentLegMute/resumeActiveCall can read the current local-hold flag
   * without depending on it directly.
   * @effect-deps isActiveCallOnLocalHold (re-syncs the ref whenever the local
   * hold flag changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern.
   */
  useEffect(() => {
    isOnLocalHoldRef.current = isActiveCallOnLocalHold;
  }, [isActiveCallOnLocalHold]);

  const syncAgentLegMute = useCallback((call: Call | null) => {
    if (!call) return;
    const shouldMute =
      isMicMutedRef.current || isOnLocalHoldRef.current;
    applyAgentLegMute(call, shouldMute);
  }, []);

  const resetAgentAudioState = useCallback(() => {
    setIsMicMuted(false);
    setIsActiveCallOnLocalHold(false);
    isMicMutedRef.current = false;
    isOnLocalHoldRef.current = false;
  }, []);

  const updateCallState = useCallback(
    (newState: string) => {
      setCallState(newState);
      onCallStateChange?.(newState);
    },
    [onCallStateChange],
  );

  const updateActiveCall = useCallback(
    (call: Call | null) => {
      const prevCall = activeCallRef.current;
      setActiveCallState(call);
      onActiveCallChange?.(call);
      if (!call) {
        resetAgentAudioState();
      } else if (call !== prevCall) {
        setIsMicMuted(false);
        setIsActiveCallOnLocalHold(false);
        isMicMutedRef.current = false;
        isOnLocalHoldRef.current = false;
      }
    },
    [onActiveCallChange, resetAgentAudioState],
  );

  const updateIncomingCall = useCallback(
    (call: Call | null) => {
      setIncomingCallState(call);
      incomingCallRef.current = call;
      onIncomingCallChange?.(call);
    },
    [onIncomingCallChange],
  );

  const clearIncomingListeners = useCallback((call: Call) => {
    const cleanup = incomingListenerCleanupsRef.current.get(call);
    if (cleanup) {
      cleanup();
      incomingListenerCleanupsRef.current.delete(call);
    }
  }, []);

  const clearIncomingCall = useCallback(() => {
    const current = incomingCallRef.current;
    if (current) {
      clearIncomingListeners(current);
    }
    updateIncomingCall(null);
  }, [clearIncomingListeners, updateIncomingCall]);

  const setMicMutedState = useCallback(
    (muted: boolean) => {
      setIsMicMuted(muted);
      isMicMutedRef.current = muted;
      if (device?.audio) {
        device.audio.outgoing(muted);
      }
      const call = activeCallRef.current;
      if (!call) return;
      syncAgentLegMute(call);
    },
    [device, syncAgentLegMute],
  );

  const setupIncomingCallListeners = useCallback(
    (call: Call) => {
      clearIncomingListeners(call);

      const handleAccept = () => {
        updateActiveCall(call);
        onStatusChange?.("connected");
        updateCallState("connected");
        updateIncomingCall(null);
        setIsActiveCallOnLocalHold(false);
        isOnLocalHoldRef.current = false;
      };

      const handleDisconnect = () => {
        updateActiveCall(null);
        onStatusChange?.("Registered");
        updateCallState("completed");
      };

      const handleReject = () => {
        updateIncomingCall(null);
      };

      const handleCancel = () => {
        updateIncomingCall(null);
      };

      const cleanups = [
        attachCallListener(call, "accept", handleAccept),
        attachCallListener(call, "disconnect", handleDisconnect),
        attachCallListener(call, "reject", handleReject),
        attachCallListener(call, "cancel", handleCancel),
      ];

      incomingListenerCleanupsRef.current.set(call, () => {
        cleanups.forEach((fn) => fn());
      });
    },
    [
      clearIncomingListeners,
      updateIncomingCall,
      updateActiveCall,
      updateCallState,
      onStatusChange,
    ],
  );

  const receiveIncoming = useCallback(
    (call: Call, suppressConnectedState?: boolean) => {
      updateIncomingCall(call);

      if (
        autoAcceptIncoming &&
        typeof call.parameters.To === "string" &&
        call.parameters.To.includes("client")
      ) {
        // Teardown listeners only — the full listener set fires "connected"
        // on accept, which campaign outbound suppresses (agent-leg accept is
        // not the customer answering). Without a disconnect handler here, a
        // callee-initiated hangup left activeCall stale and the FSM stuck,
        // so no disposition was ever written (#1218).
        clearIncomingListeners(call);
        const cleanups = [
          attachCallListener(call, "disconnect", () => {
            updateActiveCall(null);
            onStatusChange?.("Registered");
            updateCallState("completed");
          }),
          attachCallListener(call, "cancel", () => {
            updateIncomingCall(null);
          }),
        ];
        incomingListenerCleanupsRef.current.set(call, () => {
          cleanups.forEach((fn) => fn());
        });

        call.accept();
        if (!suppressConnectedState) {
          onStatusChange?.("connected");
          updateCallState("connected");
        }
        updateActiveCall(call);
        updateIncomingCall(null);
        return;
      }

      setupIncomingCallListeners(call);
    },
    [
      autoAcceptIncoming,
      updateIncomingCall,
      updateActiveCall,
      updateCallState,
      onStatusChange,
      setupIncomingCallListeners,
      clearIncomingListeners,
    ],
  );

  /**
   * @effect Sync an optional externally-supplied `incomingCall` prop (used by
   * tests / legacy bridges that don't go through the device's own "incoming"
   * event) into this hook's own incoming-call state and SDK listeners.
   * @effect-deps externalIncomingCall, receiveIncoming, updateIncomingCall,
   * clearIncomingListeners (reacts whenever the caller passes a new/cleared
   * external Call object; the other three are needed to attach/detach
   * listeners and update state for it)
   * @effect-side-effects subscription (attaches Twilio Call listeners via
   * receiveIncoming/setupIncomingCallListeners, detaches the previous call's
   * via clearIncomingListeners)
   * @effect-why-not-loader Bridges an imperative external SDK Call object
   * (test/legacy prop) into internal state and attaches its event listeners;
   * not request/response data.
   */
  useEffect(() => {
    const prev = previousExternalIncomingRef.current;
    if (externalIncomingCall !== prev) {
      if (prev) {
        clearIncomingListeners(prev);
      }
      previousExternalIncomingRef.current = externalIncomingCall;
      if (externalIncomingCall) {
        receiveIncoming(externalIncomingCall);
      } else {
        updateIncomingCall(null);
      }
    }
  }, [
    externalIncomingCall,
    receiveIncoming,
    updateIncomingCall,
    clearIncomingListeners,
  ]);

  const makeCall = useCallback(
    (params: CallConnectParams) => {
      if (!device) {
        logger.error("Device is not ready");
        onError?.(new Error("Device is not ready"));
        return;
      }

      callGenerationRef.current += 1;
      const myGeneration = callGenerationRef.current;

      const connection = device.connect({ params });
      connection
        .then((call: Call) => {
          if (callGenerationRef.current !== myGeneration) return;
          updateActiveCall(call);
          updateCallState("dialing");
        })
        .catch((err: unknown) => {
          if (callGenerationRef.current !== myGeneration) return;
          logger.error("Error making call:", err);
          onError?.(err instanceof Error ? err : new Error("Failed to make call"));
        });
    },
    [device, updateActiveCall, updateCallState, onError],
  );

  const hangUp = useCallback(
    async (call?: Call) => {
      callGenerationRef.current += 1;
      const target = call ?? activeCallRef.current;
      if (!target) {
        logger.error("No call to hang up");
        onError?.(new Error("No call to hang up"));
        return;
      }

      const isActive = target === activeCallRef.current;
      const held = heldCallsRef.current;

      try {
        const callSid = getCallSid(target);
        if (!callSid) {
          throw new Error("Call is missing a CallSid");
        }
        await hangupCall({ callSid, workspaceId });
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === "Call is not in-progress. Cannot redirect."
        ) {
          logger.debug("Call was already disconnected");
        } else {
          logger.error("Error hanging up call:", err);
          onError?.(err instanceof Error ? err : new Error("Failed to hang up call"));
        }
      }

      target.disconnect();
      if (isActive && held.length === 0 && device) {
        device.disconnectAll();
      }

      if (isActive) {
        setActiveCallState(null);
        resetAgentAudioState();
        const nextHeld = held[0];
        if (held.length > 0 && nextHeld) {
          setHeldCalls((prev) => prev.slice(1));
          setIsMicMuted(false);
          setIsActiveCallOnLocalHold(false);
          isMicMutedRef.current = false;
          isOnLocalHoldRef.current = false;
          applyAgentLegMute(nextHeld, false);
          setActiveCallState(nextHeld);
          onStatusChange?.("connected");
          updateCallState("connected");
        } else {
          onStatusChange?.("Registered");
          updateCallState("completed");
          onDeviceBusyChange?.(false);
        }
      } else {
        setHeldCalls((prev) => prev.filter((c) => c !== target));
      }
    },
    [
      device,
      workspaceId,
      updateCallState,
      onStatusChange,
      onError,
      onDeviceBusyChange,
      resetAgentAudioState,
    ],
  );

  const answer = useCallback(() => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall) {
      logger.error("No incoming call to answer");
      onError?.(new Error("No incoming call to answer"));
      return;
    }
    const currentActive = activeCallRef.current;
    if (currentActive) {
      suspendHeldCall(currentActive);
      setHeldCalls((prev) => [...prev, currentActive]);
      setActiveCallState(null);
      resetAgentAudioState();
    }
    currentIncomingCall.accept();
    updateCallState("connected");
  }, [updateCallState, onError, resetAgentAudioState]);

  const holdAndAnswer = useCallback(() => {
    answer();
  }, [answer]);

  const switchTo = useCallback(
    (call: Call) => {
      const currentActive = activeCallRef.current;
      if (currentActive) {
        suspendHeldCall(currentActive);
        setHeldCalls((prev) => {
          const next = prev.filter((c) => c !== call);
          next.push(currentActive);
          return next;
        });
        setIsActiveCallOnLocalHold(false);
        isOnLocalHoldRef.current = false;
      } else {
        setHeldCalls((prev) => prev.filter((c) => c !== call));
      }
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      applyAgentLegMute(call, false);
      setActiveCallState(call);
      onStatusChange?.("connected");
      updateCallState("connected");
    },
    [onStatusChange, updateCallState],
  );

  const holdActiveCall = useCallback(() => {
    const currentActive = activeCallRef.current;
    if (!currentActive) return;
    setIsActiveCallOnLocalHold(true);
    isOnLocalHoldRef.current = true;
    applyAgentLegMute(currentActive, true);
  }, []);

  const resumeActiveCall = useCallback(() => {
    const currentActive = activeCallRef.current;
    if (!currentActive) return;
    setIsActiveCallOnLocalHold(false);
    isOnLocalHoldRef.current = false;
    applyAgentLegMute(currentActive, isMicMutedRef.current);
  }, []);

  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const onDeviceBusyChangeRef = useRef(onDeviceBusyChange);
  const updateCallStateRef = useRef(updateCallState);
  const updateActiveCallRef = useRef(updateActiveCall);

  onStatusChangeRef.current = onStatusChange;
  onErrorRef.current = onError;
  onDeviceBusyChangeRef.current = onDeviceBusyChange;
  updateCallStateRef.current = updateCallState;
  updateActiveCallRef.current = updateActiveCall;

  /**
   * @effect Attach Twilio Call SDK event listeners (accept/audio/disconnect/
   * error) to the current active call and drive local call-state and
   * held-call transitions when it accepts, ends, or errors.
   * @effect-deps activeCall (re-subscribes only when the active call instance
   * changes; callback identities are read via refs so unstable callers cannot
   * cause spurious detach/reattach cycles)
   * @effect-side-effects subscription (Twilio Call event listeners), cleaned
   * up whenever activeCall changes or on unmount.
   * @effect-why-not-loader Subscribes to imperative SDK call-object events;
   * not request/response data.
   */
  useEffect(() => {
    if (!activeCall) return;

    const handleAccept = () => {
      updateCallStateRef.current("connected");
    };

    const handleAudio = (e: unknown) => {
      logger.debug("Call audio event:", e);
    };

    const handleDisconnect = () => {
      logger.debug("Call ended");
      const held = heldCallsRef.current;
      const next = held[0];
      if (held.length > 0 && next) {
        setHeldCalls((prev) => prev.slice(1));
        setIsMicMuted(false);
        setIsActiveCallOnLocalHold(false);
        isMicMutedRef.current = false;
        isOnLocalHoldRef.current = false;
        applyAgentLegMute(next, false);
        updateActiveCallRef.current(next);
        onStatusChangeRef.current?.("connected");
        updateCallStateRef.current("connected");
      } else {
        updateActiveCallRef.current(null);
        onStatusChangeRef.current?.("Registered");
        updateCallStateRef.current("completed");
        onDeviceBusyChangeRef.current?.(false);
      }
    };

    const handleError = (err: unknown) => {
      const error = err instanceof Error ? err : new Error("Call error");
      onDeviceBusyChangeRef.current?.(false);
      onErrorRef.current?.(error);
      updateCallStateRef.current("failed");
      logger.error("Call error:", error);
    };

    const cleanups = [
      attachCallListener(activeCall, "accept", handleAccept),
      attachCallListener(activeCall, "audio", handleAudio),
      attachCallListener(activeCall, "disconnect", handleDisconnect),
      attachCallListener(activeCall, "error", handleError),
    ];

    return () => cleanups.forEach((fn) => fn());
  }, [activeCall]);

  /**
   * @effect Attach a disconnect listener to each currently held call so a held
   * call that ends remotely (e.g. the other party hangs up while on hold) is
   * removed from local `heldCalls` state instead of lingering.
   * @effect-deps heldCalls (re-subscribes whenever the held-calls list changes,
   * to attach listeners to newly-held calls and drop stale ones)
   * @effect-side-effects subscription (Twilio Call "disconnect" listener per
   * held call), cleaned up whenever the list changes or on unmount.
   * @effect-why-not-loader SDK event subscription on live call objects; not
   * request/response data.
   */
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    heldCalls.forEach((call) => {
      const onDisconnect = () => {
        setHeldCalls((prev) => prev.filter((c) => c !== call));
      };
      cleanups.push(attachCallListener(call, "disconnect", onDisconnect));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [heldCalls]);

  /**
   * @effect On unmount, run any incoming-call SDK listener cleanups still
   * pending in `incomingListenerCleanupsRef` so no Twilio Call listeners leak
   * past the hook's lifetime.
   * @effect-deps [] — intentionally mount-once, cleanup-only; the ref's Map
   * object identity never changes (created once via useRef), so capturing it
   * once here and reading it in the cleanup is safe.
   * @effect-side-effects subscription cleanup (invokes stored SDK
   * listener-removal functions); runs only on unmount.
   * @effect-why-not-loader Teardown of imperative SDK listeners on unmount;
   * not request/response data.
   */
  useEffect(() => {
    const incomingListenerCleanups = incomingListenerCleanupsRef.current;
    return () => {
      incomingListenerCleanups.forEach((cleanup) => cleanup());
      incomingListenerCleanups.clear();
    };
  }, []);

  const sessionPhase = deriveCallSessionPhase(
    activeCall,
    incomingCall,
    heldCalls.length,
    callState,
  );

  return {
    activeCall,
    heldCalls,
    incomingCall,
    callState,
    sessionPhase,
    isMicMuted,
    isActiveCallOnLocalHold,
    makeCall,
    hangUp,
    answer,
    holdAndAnswer,
    switchTo,
    holdActiveCall,
    resumeActiveCall,
    setMicMuted: setMicMutedState,
    receiveIncoming,
    clearIncomingCall,
    setActiveCall: updateActiveCall,
  };
}
