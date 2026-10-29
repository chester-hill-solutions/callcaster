import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { declineIncomingCall } from "@/components/calls/IncomingCallPanel";
import { normalizePhoneNumber } from "@/lib/phone";
import { sendCallDigits } from "@/lib/twilio/twilio-call-adapter.client";
import { prepareHandsetDial } from "@/lib/services/hooks-api";

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
  const [isPreparingOutbound, setIsPreparingOutbound] = useState(false);
  const outboundPreparationRef = useRef(false);
  const outboundEpochRef = useRef(0);
  const dialIntentRef = useRef<{ context: string; id: string } | null>(null);
  const receiveIncomingRef = useRef<(call: Call) => void>(() => {});

  /**
   * @effect Cancel preparation responses when the committed handset owner changes.
   * @effect-deps workspaceId, clientIdentity (the authenticated dial owner).
   * @effect-side-effects none (invalidates async work and clears its pending state).
   * @effect-why-not-loader An imperative SDK start must not follow a stale browser request.
   */
  useEffect(() => {
    const epoch = ++outboundEpochRef.current;
    outboundPreparationRef.current = false;
    dialIntentRef.current = null;
    setIsPreparingOutbound(false);
    return () => { if (outboundEpochRef.current === epoch) outboundEpochRef.current += 1; };
  }, [workspaceId, clientIdentity]);

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

  const ownedCallsRef = useRef<readonly (Call | null)[]>([]);
  const connection = useTwilioConnection({
    token,
    getOwnedCalls: () => ownedCallsRef.current,
    deviceOptions,
    onIncomingCall: (call) => receiveIncomingRef.current(call),
    onStatusChange: noop,
    onError: handleConnectionError,
    onDeviceBusyChange: noop,
  });

  const handleCallError = useCallback(
    (err: Error) => onError(err?.message ?? "Call error"),
    [onError],
  );

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    onStatusChange: noop,
    onError: handleCallError,
    onDeviceBusyChange: noop,
  });
  ownedCallsRef.current = [callHandling.activeCall, callHandling.incomingCall, ...callHandling.heldCalls];

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
    outboundEpochRef.current += 1;
    outboundPreparationRef.current = true;
    try {
      for (const held of callHandling.heldCalls) {
        await callHandling.hangUp(held);
      }
      await callHandling.hangUp();
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
  activeCallRef.current = callHandling.activeCall;
  hangUpRef.current = callHandling.hangUp;

  /**
   * @effect On unmount (e.g. navigating away from the softphone), hang up any
   * in-progress call through the provider so a call session never
   * outlives the component and keeps consuming a line/credits.
   * @effect-deps [] — intentionally mount-once, cleanup-only; reads activeCall/
   * hangUp via refs kept fresh on every render (see activeCallRef/
   * hangUpRef above) so the cleanup always sees the latest call
   * without re-running (and re-teardown-registering) this effect each render.
   * @effect-side-effects fetch (hangUp() calls the Twilio hangup API).
   * useTwilioConnection owns device teardown.
   * @effect-why-not-loader Imperative SDK teardown tied to component unmount,
   * not request/response data.
   */
  useEffect(() => {
    return () => {
      if (activeCallRef.current) {
        hangUpRef.current?.().catch(() => {});
      }
    };
  }, []);

  const handleKeypadPress = useCallback(
    (key: string) => {
      sendCallDigits(callHandling.activeCall, key);
    },
    [callHandling.activeCall],
  );

  const handleOutboundDial = useCallback(async () => {
    if (outboundPreparationRef.current || callHandling.activeCall || callHandling.incomingCall || callHandling.heldCalls.length) return;
    const raw = outboundTo.trim();
    if (!raw) {
      setOutboundError("Enter a phone number");
      return;
    }
    setOutboundError(null);
    let to: string;
    try { to = normalizePhoneNumber(raw); }
    catch {
      setOutboundError("Invalid phone number");
      onError("Invalid phone number");
      return;
    }
    const epoch = outboundEpochRef.current;
    const context = JSON.stringify([workspaceId, clientIdentity, to]);
    if (dialIntentRef.current?.context !== context) dialIntentRef.current = { context, id: crypto.randomUUID() };
    outboundPreparationRef.current = true;
    setIsPreparingOutbound(true);
    try {
      const reservationId = await prepareHandsetDial({ workspaceId, clientIdentity, to, intentId: dialIntentRef.current.id });
      if (outboundEpochRef.current !== epoch) return;
      if (ownedCallsRef.current.some(Boolean)) {
        setOutboundError("A call is already active. End it before dialing.");
        return;
      }
      const call = await callHandling.makeCall({ To: to, workspace_id: workspaceId, client_identity: clientIdentity,
        credit_reservation: reservationId });
      if (outboundEpochRef.current !== epoch) return;
      if (call) dialIntentRef.current = null;
      else setOutboundError("The call could not be connected. Check its status before retrying.");
    } catch (error) {
      if (outboundEpochRef.current !== epoch) return;
      const message = error instanceof Error ? error.message : "We could not prepare this call. Please try again.";
      setOutboundError(message);
      onError(message);
    } finally {
      if (outboundEpochRef.current === epoch) {
        outboundPreparationRef.current = false;
        setIsPreparingOutbound(false);
      }
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
    isPreparingOutbound,
    clearOutboundError,
    handleOutboundDial,
    showOutboundDialer,
  };
}

export type SoftphoneController = ReturnType<typeof useSoftphoneController>;
