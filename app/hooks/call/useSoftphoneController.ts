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
    // Defensive: Twilio's register() can reject with an undefined/messageless
    // reason (see useTwilioConnection.ts's device.register().catch); optional
    // chain + fallback so a missing message never throws
    // "Cannot read properties of undefined (reading 'message')" here.
    (err: Error) => onError(err?.message ?? "Twilio connection error"),
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
    // Same defensive guard as handleConnectionError above.
    onError: (err) => onError(err?.message ?? "Call error"),
    onDeviceBusyChange: noop,
  });

  /**
   * @effect Mirror the latest `callHandling.receiveIncoming` handler into a ref
   * so the `onIncomingCall` callback handed to useTwilioConnection (a stable
   * arrow function that reads the ref) always invokes current call-handling
   * logic without needing to resubscribe the connection's device listener.
   * @effect-deps callHandling.receiveIncoming (only re-syncs the ref when the
   * handler identity actually changes)
   * @effect-side-effects none (plain ref assignment)
   * @effect-why-not-loader Not data fetching; this is the "latest ref" pattern
   * used to avoid re-registering Twilio device listeners on every render.
   */
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
    // Deps list the specific callHandling fields actually read (activeCall,
    // heldCalls, hangUp); callHandling itself is a fresh object every render
    // (useCallHandling isn't memoized), so depending on the whole object would
    // recreate this callback on every render of a live call-session hook for
    // no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * @effect On unmount (e.g. navigating away from the softphone), hang up any
   * in-progress call and disconnect the Twilio device so a call session never
   * outlives the component and keeps consuming a line/credits.
   * @effect-deps [] — intentionally mount-once, cleanup-only; reads activeCall/
   * hangUp/device via refs kept fresh on every render (see activeCallRef/
   * hangUpRef/deviceRef above) so the cleanup always sees the latest call
   * without re-running (and re-teardown-registering) this effect each render.
   * @effect-side-effects fetch (hangUp() calls the Twilio hangup API) + dom/sdk
   * (device.disconnectAll() tears down the WebRTC device); runs only in cleanup.
   * @effect-why-not-loader Imperative SDK teardown tied to component unmount,
   * not request/response data.
   */
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
