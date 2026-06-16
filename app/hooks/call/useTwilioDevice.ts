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

  useEffect(() => {
    receiveIncomingRef.current = callHandling.receiveIncoming;
  }, [callHandling.receiveIncoming]);

  const { callDuration, setCallDuration } = useCallDuration(callHandling.callState);

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
