import { useEffect, useRef, useState } from "react";
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
    onCallStateChange: (newCallState) => {
      switch (newCallState) {
        case "dialing": send({ type: "START_DIALING" }); break;
        case "connected": send({ type: "CONNECT" }); break;
        case "completed": send({ type: "HANG_UP" }); break;
        case "failed": send({ type: "FAIL" }); break;
      }
    },
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
   * @effect Hang up the active call and disconnect the Twilio device when
   * the component unmounts, so calls do not stay live and consume credits
   * after the agent navigates away.
   * @effect-deps callHandling.hangUp, callHandling.activeCall, callHandling.callState, connection.device
   * @effect-side-effects hung up / disconnecting SDK calls + device
   * @effect-why-not-loader Teardown of imperative SDK resources on unmount.
   */
  useEffect(() => {
    const hangUp = callHandling.hangUp;
    const device = connection.device;
    const hasActiveCall = Boolean(callHandling.activeCall);
    const isActive = callHandling.callState === "connected" || callHandling.callState === "dialing";
    return () => {
      if (hasActiveCall || isActive) {
        hangUp().catch(() => {
          logger.debug("Call hung up during unmount cleanup");
        });
      }
      device?.disconnectAll();
    };
  }, [callHandling.hangUp, callHandling.activeCall, callHandling.callState, connection.device]);

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
