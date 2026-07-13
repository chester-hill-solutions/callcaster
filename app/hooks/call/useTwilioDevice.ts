import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { useCallDuration } from "./useCallDuration";
import { useTwilioConnection } from "./useTwilioConnection";
import { useCallHandling } from "./useCallHandling";

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
}

/**
 * Coordinates Twilio device connection and canonical call session handling.
 */
export function useTwilioDevice(
  token: string,
  selectedDevice: string,
  workspaceId: string,
  send: (action: { type: string }) => void,
): TwilioDeviceHook {
  if (!token) {
    throw new Error("useTwilioDevice: token is required");
  }
  if (!workspaceId) {
    throw new Error("useTwilioDevice: workspaceId is required");
  }
  if (typeof send !== "function") {
    throw new Error("useTwilioDevice: send callback must be a function");
  }

  const [deviceIsBusy, setIsBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const receiveIncomingRef = useRef<(call: Call) => void>(() => {});

  const connection = useTwilioConnection({
    token,
    onIncomingCall: (call) => receiveIncomingRef.current(call),
    onStatusChange: (newStatus) => {
      setStatus(newStatus);
    },
    onError: (err) => {
      setError(err);
    },
    onDeviceBusyChange: (isBusy) => {
      setIsBusy(isBusy);
    },
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    onStatusChange: (newStatus) => {
      setStatus(newStatus);
    },
    onError: (err) => {
      setError(err);
    },
    onDeviceBusyChange: (isBusy) => {
      setIsBusy(isBusy);
    },
    onConnect: () => {
      send({ type: "CONNECT" });
    },
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
    receiveIncomingRef.current = callHandling.receiveIncoming;
  }, [callHandling.receiveIncoming]);

  const { callDuration, setCallDuration } = useCallDuration(callHandling.callState);

  /**
   * CANDIDATE-REMOVE: @effect Mirror useTwilioConnection's `connection.error`
   * into this hook's own local `error` state.
   * @effect-deps connection.error, error (re-runs when the underlying
   * connection error changes or local error is updated, guarded against
   * redundant sets)
   * @effect-side-effects none (setState mirroring only)
   * @effect-why-not-loader N/A — not a fetch, but likely redundant: the
   * `onError` callback passed to useTwilioConnection below already calls
   * `setError` synchronously on every connection error, so this effect
   * duplicates that sync via a second mechanism (derived-state-copied-into-
   * state anti-pattern). Worth checking whether it's dead code or covers a
   * real gap (e.g. an error set internally by useTwilioConnection without
   * going through onError) before removing.
   */
  useEffect(() => {
    if (connection.error && connection.error !== error) {
      setError(connection.error);
    }
  }, [connection.error, error]);

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
  };
}
