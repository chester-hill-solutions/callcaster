import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { useCallDuration } from "./useCallDuration";
import { useTwilioConnection } from "./useTwilioConnection";
import { useCallHandling } from "./useCallHandling";
import { logger } from "@/lib/logger.client";

interface CallConnectParams {
  To: string;
  [key: string]: string;
}

interface TwilioDeviceHook {
  device: Device | null;
  status: string;
  error: Error | null;
  activeCall: Call | null;
  incomingCall: Call | null;
  isMicMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  makeCall: (params: CallConnectParams) => void;
  hangUp: () => void;
  answer: () => void;
  holdAndAnswer: () => void;
  callState: string;
  callDuration: number;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  deviceIsBusy: boolean;
  /** Manually recover from a terminal Device error — see useTwilioConnection. */
  reconnect: () => void;
}

/**
 * Coordinates Twilio device connection and canonical call session handling.
 */
export function useTwilioDevice(
  token: string,
  selectedDevice: string,
  workspaceId: string,
  send: (action: { type: string }) => void,
  onTokenWillExpire?: () => void,
): TwilioDeviceHook {
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
    switch (newCallState) {
      case "dialing": send({ type: "START_DIALING" }); break;
      case "completed": send({ type: "HANG_UP" }); break;
      case "failed": send({ type: "FAIL" }); break;
    }
  }, [send]);

  const connection = useTwilioConnection({
    token,
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
  const deviceRef = useRef(connection.device);

  activeCallRef.current = callHandling.activeCall;
  hangUpRef.current = callHandling.hangUp;
  callStateRef.current = callHandling.callState;
  deviceRef.current = connection.device;

  /**
   * @effect Hang up the active call and disconnect the Twilio device when
   * the component unmounts, so calls do not stay live and consume credits
   * after the agent navigates away.
   * @effect-deps [] — mount-once cleanup-only; reads latest values via refs
   * kept fresh on every render so the unmount teardown always acts on the
   * current call/device regardless of stale closures.
   * @effect-side-effects hung up / disconnecting SDK calls + device
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
      deviceRef.current?.disconnectAll();
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
    reconnect: connection.reconnect,
  };
}
