import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { useCallDuration } from "./useCallDuration";
import { useTwilioConnection } from "./useTwilioConnection";
import { useCallHandling } from "./useCallHandling";
import { logger } from "@/lib/logger.client";

interface TwilioDeviceHook {
  device: Device | null;
  status: string;
  error: Error | null;
  activeCall: Call | null;
  incomingCall: Call | null;
  isMicMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  makeCall: ReturnType<typeof useCallHandling>["makeCall"];
  hangUp: () => void;
  answer: () => void;
  holdAndAnswer: () => void;
  callState: string;
  callDuration: number;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  deviceIsBusy: boolean;
  hasOwnedCalls: boolean;
  hasHeldCalls: boolean;
  /** Manually recover from a terminal Device error — see useTwilioConnection. */
  reconnect: () => void;
}

interface UseTwilioDeviceOptions {
  token: string;
  selectedDevice: string;
  workspaceId: string;
  send: (action: { type: string }) => void;
  onTokenWillExpire?: () => void;
  /** Gate device creation/registration behind explicit Join (#1313). Defaults
   * to true so callers that don't opt in keep connecting on mount. */
  enabled?: boolean;
  /** Agent resource events must not terminate the independent customer owner. */
  managesCustomerAudio?: () => boolean;
}

/**
 * Coordinates Twilio device connection and canonical call session handling.
 */
export function useTwilioDevice({
  token,
  selectedDevice,
  workspaceId,
  send,
  onTokenWillExpire,
  enabled = true,
  managesCustomerAudio,
}: UseTwilioDeviceOptions): TwilioDeviceHook {
  if (!token) {
    logger.error("useTwilioDevice: token is required");
  }
  if (!workspaceId) {
    logger.error("useTwilioDevice: workspaceId is required");
  }
  if (typeof send !== "function") {
    logger.error("useTwilioDevice: send callback must be a function");
  }

  const [deviceIsBusy, setIsBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const receiveIncomingRef = useRef<(call: Call, suppressConnectedState?: boolean) => void>(() => {});

  const onStatusChange = useCallback((newStatus: string) => {
    setStatus(newStatus);
    // "Registered" is the connection's own signal that it's healthy —
    // clear any stale error from a prior failure. This state was set-only
    // otherwise: a single transient failure left the "Phone connection
    // error" banner up for the rest of the shift even after recovery.
    if (newStatus === "Registered") {
      setError(null);
    }
  }, []);

  const onDeviceError = useCallback((err: Error) => {
    setError(err);
  }, []);

  const onCallError = useCallback((err: Error) => {
    logger.error("Call handling error:", err);
  }, []);

  const onDeviceBusy = useCallback((isBusy: boolean) => {
    setIsBusy(isBusy);
  }, []);

  const onCallState = useCallback((newCallState: string) => {
    if (managesCustomerAudio?.()) return;
    switch (newCallState) {
      case "dialing": send({ type: "START_DIALING" }); break;
      case "completed": send({ type: "HANG_UP" }); break;
      case "failed": send({ type: "FAIL" }); break;
    }
  }, [send, managesCustomerAudio]);

  const ownedCallsRef = useRef<readonly (Call | null)[]>([]);
  const connection = useTwilioConnection({
    token,
    getOwnedCalls: () => ownedCallsRef.current,
    enabled,
    onIncomingCall: (call) => receiveIncomingRef.current(call),
    onStatusChange,
    onError: onDeviceError,
    onDeviceBusyChange: onDeviceBusy,
    onTokenWillExpire,
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    autoAcceptIncoming: true,
    onCallStateChange: onCallState,
    onStatusChange,
    onError: onCallError,
    onDeviceBusyChange: onDeviceBusy,
  });
  ownedCallsRef.current = [callHandling.activeCall, callHandling.incomingCall, ...callHandling.heldCalls];
  const releaseIdleDevice = connection.releaseIdleDevice;

  /**
   * @effect Release a suspended SDK after its last active, incoming or held call closes.
   * @effect-deps enabled, releaseIdleDevice, callHandling.activeCall,
   * callHandling.incomingCall, callHandling.heldCalls (actual SDK ownership).
   * @effect-side-effects idle Device teardown through the connection owner.
   * @effect-why-not-loader Provider call-close events can arrive after the phone
   * handoff. See https://react.dev/learn/synchronizing-with-effects.
   */
  useEffect(() => {
    if (!enabled) releaseIdleDevice();
  }, [enabled, releaseIdleDevice, callHandling.activeCall, callHandling.incomingCall, callHandling.heldCalls]);

  /**
   * @effect Mirror the latest `callHandling.receiveIncoming` handler into a
   * ref so the stable `onIncomingCall` callback passed to useTwilioConnection
   * always invokes current call-handling logic.
   * @effect-deps callHandling.receiveIncoming (only re-syncs the ref when the
   * handler identity changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; "latest ref" pattern to avoid
   * re-registering Twilio device listeners on every render.
   */
  useEffect(() => {
    receiveIncomingRef.current = (call: Call) => callHandling.receiveIncoming(call, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callHandling.receiveIncoming]);

  const { callDuration, setCallDuration } = useCallDuration(callHandling.callState);

  const activeCallRef = useRef(callHandling.activeCall);
  const hangUpRef = useRef(callHandling.hangUp);
  const callStateRef = useRef(callHandling.callState);

  activeCallRef.current = callHandling.activeCall;
  hangUpRef.current = callHandling.hangUp;
  callStateRef.current = callHandling.callState;

  /**
   * @effect End the active call through the provider when
   * the component unmounts, so calls do not stay live and consume credits
   * after the agent navigates away.
   * @effect-deps [] — mount-once cleanup-only; reads latest values via refs
   * kept fresh on every render so the unmount teardown always acts on the
   * current call regardless of stale closures. Device cleanup belongs to
   * useTwilioConnection.
   * @effect-side-effects hangUp calls the provider hangup API.
   * @effect-why-not-loader Teardown of imperative SDK resources on unmount.
   */
  useEffect(() => {
    return () => {
      const hasActiveCall = Boolean(activeCallRef.current);
      const isActive =
        callStateRef.current === "connected" || callStateRef.current === "dialing";
      if (hasActiveCall || isActive) {
        hangUpRef.current?.().catch(() => {
          logger.debug("Call hung up during unmount cleanup");
        });
      }
    };
  }, []);

  return {
    device: connection.device,
    status,
    error,
    activeCall: callHandling.activeCall,
    incomingCall: callHandling.incomingCall,
    isMicMuted: callHandling.isMicMuted,
    setMicMuted: callHandling.setMicMuted,
    makeCall: callHandling.makeCall,
    hangUp: callHandling.hangUp,
    answer: callHandling.answer,
    holdAndAnswer: callHandling.holdAndAnswer,
    callState: callHandling.callState,
    callDuration,
    setCallDuration,
    setIsBusy,
    deviceIsBusy,
    hasOwnedCalls: [callHandling.activeCall, callHandling.incomingCall, ...callHandling.heldCalls].some(call => call && call.status?.() !== "closed"),
    hasHeldCalls: callHandling.heldCalls.some(call => call.status?.() !== "closed"),
    reconnect: connection.reconnect,
  };
}
