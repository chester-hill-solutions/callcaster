import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { declineIncomingCall } from "@/components/calls/IncomingCallPanel";
import { normalizePhoneNumber } from "@/lib/phone";
import { sendCallDigits } from "@/lib/twilio/twilio-call-adapter.client";

type UseSoftphoneControllerOptions = {
  token: string;
  workspaceId: string;
  clientIdentity: string;
  endSession: () => void;
  onNavigateBack: () => void;
  onError: (message: string) => void;
};

export function useSoftphoneController({
  token,
  workspaceId,
  clientIdentity,
  endSession,
  onNavigateBack,
  onError,
}: UseSoftphoneControllerOptions) {
  const [outboundTo, setOutboundTo] = useState("");
  const [outboundError, setOutboundError] = useState<string | null>(null);
  const receiveIncomingRef = useRef<(call: Call) => void>(() => {});

  const noop = useCallback(() => {}, []);
  const deviceOptions = useMemo(() => ({ allowIncomingWhileBusy: true }), []);

  const handleConnectionError = useCallback(
    (err: Error) => onError(err.message),
    [onError],
  );

  const connection = useTwilioConnection({
    token,
    deviceOptions,
    onIncomingCall: (call) => receiveIncomingRef.current(call),
    onStatusChange: noop,
    onError: handleConnectionError,
    onDeviceBusyChange: noop,
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    onStatusChange: noop,
    onError: (err) => onError(err.message),
    onDeviceBusyChange: noop,
  });

  useEffect(() => {
    receiveIncomingRef.current = callHandling.receiveIncoming;
  }, [callHandling.receiveIncoming]);

  const handleDecline = useCallback(() => {
    declineIncomingCall(callHandling.incomingCall);
    callHandling.clearIncomingCall();
  }, [callHandling]);

  const handleEndSession = useCallback(async () => {
    try {
      for (const held of callHandling.heldCalls) {
        await callHandling.hangUp(held);
      }
      if (callHandling.activeCall) {
        await callHandling.hangUp();
      }
    } catch {
      connection.device?.disconnectAll();
    }
    endSession();
    onNavigateBack();
  }, [
    callHandling.activeCall,
    callHandling.heldCalls,
    callHandling.hangUp,
    connection.device,
    endSession,
    onNavigateBack,
  ]);

  const activeCallRef = useRef(callHandling.activeCall);
  const hangUpRef = useRef(callHandling.hangUp);
  const deviceRef = useRef(connection.device);
  activeCallRef.current = callHandling.activeCall;
  hangUpRef.current = callHandling.hangUp;
  deviceRef.current = connection.device;

  useEffect(() => {
    return () => {
      if (activeCallRef.current) {
        hangUpRef.current?.().catch(() => {});
      }
      deviceRef.current?.disconnectAll();
    };
  }, []);

  const handleKeypadPress = useCallback(
    (key: string) => {
      sendCallDigits(callHandling.activeCall, key);
    },
    [callHandling.activeCall],
  );

  const handleOutboundDial = useCallback(() => {
    const raw = outboundTo.trim();
    if (!raw) {
      setOutboundError("Enter a phone number");
      return;
    }
    setOutboundError(null);
    try {
      const to = normalizePhoneNumber(raw);
      callHandling.makeCall({
        To: to,
        workspace_id: workspaceId,
        client_identity: clientIdentity,
      });
    } catch {
      setOutboundError("Invalid phone number");
      onError("Invalid phone number");
    }
  }, [outboundTo, workspaceId, clientIdentity, callHandling, onError]);

  const clearOutboundError = useCallback(() => {
    setOutboundError(null);
  }, []);

  const showOutboundDialer =
    !callHandling.activeCall &&
    callHandling.heldCalls.length === 0 &&
    !callHandling.incomingCall;

  return {
    connection,
    callHandling,
    incomingCall: callHandling.incomingCall,
    handleDecline,
    handleEndSession,
    handleKeypadPress,
    outboundTo,
    setOutboundTo,
    outboundError,
    clearOutboundError,
    handleOutboundDial,
    showOutboundDialer,
  };
}

export type SoftphoneController = ReturnType<typeof useSoftphoneController>;
