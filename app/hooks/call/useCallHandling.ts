import { useEffect, useState, useCallback, useRef } from 'react';
import type { Call, Device } from "@twilio/voice-sdk";
import { hangupCall } from '@/lib/services/hooks-api';
import { logger } from '@/lib/logger.client';

interface CallConnectParams {
  To: string;
  [key: string]: string;
}

interface UseCallHandlingOptions {
  device: Device | null;
  workspaceId: string;
  incomingCall: Call | null;
  onCallStateChange?: (callState: string) => void;
  onActiveCallChange?: (call: Call | null) => void;
  onIncomingCallChange?: (call: Call | null) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onDeviceBusyChange?: (isBusy: boolean) => void;
  onConnect?: () => void;
}

function muteCall(call: Call, muted: boolean): void {
  if (typeof (call as Call & { mute?: (m: boolean) => void }).mute === 'function') {
    (call as Call & { mute: (m: boolean) => void }).mute(muted);
  }
}

interface UseCallHandlingReturn {
  activeCall: Call | null;
  /** Calls that are connected but on hold (muted). */
  heldCalls: Call[];
  incomingCall: Call | null;
  callState: string;
  makeCall: (params: CallConnectParams) => void;
  hangUp: (call?: Call) => Promise<void>;
  answer: () => void;
  /** Put the current active call on hold and answer the incoming call. */
  holdAndAnswer: () => void;
  /** Switch to a held call (put current on hold, activate the selected call). */
  switchTo: (call: Call) => void;
  setIncomingCall: (call: Call | null) => void;
  setActiveCall: (call: Call | null) => void;
}

/**
 * Hook for managing Twilio call operations
 * 
 * Handles making calls, hanging up, answering incoming calls, and managing call state.
 * Works in conjunction with useTwilioConnection for device management.
 * 
 * @param options - Configuration options for call handling
 * @returns Call state and call operation functions
 * 
 * @example
 * ```tsx
 * const {
 *   activeCall,
 *   incomingCall,
 *   callState,
 *   makeCall,
 *   hangUp,
 *   answer,
 * } = useCallHandling({
 *   device: twilioDevice,
 *   workspaceId: workspace.id,
 *   incomingCall: currentIncomingCall,
 *   onCallStateChange: (state) => console.log('Call state:', state),
 * });
 * ```
 */
export function useCallHandling({
  device,
  workspaceId,
  incomingCall: initialIncomingCall,
  onCallStateChange,
  onActiveCallChange,
  onIncomingCallChange,
  onStatusChange,
  onError,
  onDeviceBusyChange,
  onConnect,
}: UseCallHandlingOptions): UseCallHandlingReturn {
  const [activeCall, setActiveCallState] = useState<Call | null>(null);
  const [heldCalls, setHeldCalls] = useState<Call[]>([]);
  const [incomingCall, setIncomingCallState] = useState<Call | null>(initialIncomingCall || null);
  const [callState, setCallState] = useState<string>('idle');
  const incomingCallRef = useRef<Call | null>(initialIncomingCall || null);
  const previousIncomingCallRef = useRef<Call | null>(initialIncomingCall || null);
  const heldCallsRef = useRef<Call[]>([]);
  const activeCallRef = useRef<Call | null>(null);

  useEffect(() => {
    heldCallsRef.current = heldCalls;
  }, [heldCalls]);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Sync incoming call ref with state
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Update call state and notify callbacks
  const updateCallState = useCallback((newState: string) => {
    setCallState(newState);
    onCallStateChange?.(newState);
  }, [onCallStateChange]);

  // Update active call and notify callbacks
  const updateActiveCall = useCallback((call: Call | null) => {
    setActiveCallState(call);
    onActiveCallChange?.(call);
  }, [onActiveCallChange]);

  // Update incoming call and notify callbacks
  const updateIncomingCall = useCallback((call: Call | null) => {
    setIncomingCallState(call);
    incomingCallRef.current = call;
    onIncomingCallChange?.(call);
  }, [onIncomingCallChange]);

  // Handle incoming call setup
  const handleIncomingCall = useCallback((call: Call) => {
    updateIncomingCall(call);
    
    // Auto-accept client calls
    if (typeof call.parameters.To === "string" && call.parameters.To.includes('client')) {
      call.accept();
      onStatusChange?.('connected');
      updateCallState('connected');
      updateActiveCall(call);
      updateIncomingCall(null);
      onConnect?.();
      return;
    }

    // Set up event handlers for incoming call
    const handleAccept = () => {
      updateActiveCall(call);
      onStatusChange?.('connected');
      updateCallState('connected');
      updateIncomingCall(null);
    };

    const handleDisconnect = () => {
      updateActiveCall(null);
      onStatusChange?.('Registered');
      updateCallState('completed');
    };

    const handleReject = () => {
      updateIncomingCall(null);
    };

    const handleCancel = () => {
      updateIncomingCall(null);
    };

    call.on('accept', handleAccept);
    call.on('disconnect', handleDisconnect);
    call.on('reject', handleReject);
    call.on('cancel', handleCancel);
  }, [updateIncomingCall, updateActiveCall, updateCallState, onStatusChange, onConnect]);

  // Sync incoming call prop changes (after function definitions)
  useEffect(() => {
    if (initialIncomingCall !== previousIncomingCallRef.current) {
      previousIncomingCallRef.current = initialIncomingCall;
      if (initialIncomingCall) {
        handleIncomingCall(initialIncomingCall);
      } else {
        updateIncomingCall(null);
      }
    }
  }, [initialIncomingCall, handleIncomingCall, updateIncomingCall]);

  // Make an outgoing call
  const makeCall = useCallback((params: CallConnectParams) => {
    if (!device) {
      logger.error('Device is not ready');
      onError?.(new Error('Device is not ready'));
      return;
    }
    
    const connection = device.connect({ params });
    connection.then((call: Call) => {
      updateActiveCall(call);
      updateCallState('dialing');
    }).catch((err: unknown) => {
      logger.error('Error making call:', err);
      onError?.(err instanceof Error ? err : new Error('Failed to make call'));
    });
  }, [device, updateActiveCall, updateCallState, onError]);

  // Hang up a specific call or the active call; if active is hung up and there are held calls, promote first held
  const hangUp = useCallback(
    async (call?: Call) => {
      const target = call ?? activeCallRef.current;
      if (!target) {
        logger.error('No call to hang up');
        onError?.(new Error('No call to hang up'));
        return;
      }

      const isActive = target === activeCallRef.current;
      const held = heldCallsRef.current;

      try {
        const callSid = target.parameters.CallSid;
        if (!callSid) {
          throw new Error("Call is missing a CallSid");
        }
        await hangupCall({ callSid, workspaceId });
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === 'Call is not in-progress. Cannot redirect.'
        ) {
          logger.debug('Call was already disconnected');
        } else {
          logger.error('Error hanging up call:', err);
          onError?.(err instanceof Error ? err : new Error('Failed to hang up call'));
        }
      }

      target.disconnect();
      if (isActive && held.length === 0) {
        device?.disconnectAll();
      }

      if (isActive) {
        setActiveCallState(null);
        const nextHeld = held[0];
        if (held.length > 0 && nextHeld) {
          setHeldCalls((prev) => prev.slice(1));
          muteCall(nextHeld, false);
          setActiveCallState(nextHeld);
          onStatusChange?.('connected');
          updateCallState('connected');
        } else {
          onStatusChange?.('Registered');
          updateCallState('completed');
          onDeviceBusyChange?.(false);
        }
      } else {
        setHeldCalls((prev) => prev.filter((c) => c !== target));
      }
    },
    [
      workspaceId,
      updateCallState,
      onStatusChange,
      onError,
      onDeviceBusyChange,
    ]
  );

  // Answer an incoming call (or hold current and answer if already on a call)
  const answer = useCallback(() => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall) {
      logger.error('No incoming call to answer');
      onError?.(new Error('No incoming call to answer'));
      return;
    }
    const currentActive = activeCallRef.current;
    if (currentActive) {
      muteCall(currentActive, true);
      setHeldCalls((prev) => [...prev, currentActive]);
      setActiveCallState(null);
    }
    currentIncomingCall.accept();
    updateCallState('connected');
  }, [updateCallState, onError]);

  const holdAndAnswer = useCallback(() => {
    answer();
  }, [answer]);

  const switchTo = useCallback(
    (call: Call) => {
      const currentActive = activeCallRef.current;
      if (currentActive) {
        muteCall(currentActive, true);
        setHeldCalls((prev) => {
          const next = prev.filter((c) => c !== call);
          next.push(currentActive);
          return next;
        });
      } else {
        setHeldCalls((prev) => prev.filter((c) => c !== call));
      }
      muteCall(call, false);
      setActiveCallState(call);
      onStatusChange?.('connected');
      updateCallState('connected');
    },
    [onStatusChange, updateCallState]
  );

  // Handle active call events
  useEffect(() => {
    if (!activeCall) return;

    const handleAccept = () => {
      updateCallState('connected');
    };

    const handleAudio = (e: unknown) => {
      logger.debug('Call audio event:', e);
    };

    const handleDisconnect = () => {
      logger.debug('Call ended');
      const held = heldCallsRef.current;
      const next = held[0];
      if (held.length > 0 && next) {
        setHeldCalls((prev) => prev.slice(1));
        muteCall(next, false);
        updateActiveCall(next);
        onStatusChange?.('connected');
        updateCallState('connected');
      } else {
        updateActiveCall(null);
        onStatusChange?.('Registered');
        updateCallState('completed');
        onDeviceBusyChange?.(false);
      }
    };

    const handleError = (err: Error) => {
      onDeviceBusyChange?.(false);
      onError?.(err);
      onStatusChange?.('error');
      updateCallState('failed');
      logger.error('Call error:', err);
    };

    activeCall.on('accept', handleAccept);
    activeCall.on('audio', handleAudio);
    activeCall.on('disconnect', handleDisconnect);
    activeCall.on('error', handleError);

    return () => {
      activeCall.removeAllListeners('accept');
      activeCall.removeAllListeners('audio');
      activeCall.removeAllListeners('disconnect');
      activeCall.removeAllListeners('error');
    };
  }, [activeCall, updateCallState, updateActiveCall, onStatusChange, onError, onDeviceBusyChange]);

  // When a held call disconnects, remove it from heldCalls
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    heldCalls.forEach((call) => {
      const onDisconnect = () => {
        setHeldCalls((prev) => prev.filter((c) => c !== call));
      };
      call.on('disconnect', onDisconnect);
      cleanups.push(() => call.removeAllListeners('disconnect'));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [heldCalls]);

  return {
    activeCall,
    heldCalls,
    incomingCall,
    callState,
    makeCall,
    hangUp,
    answer,
    holdAndAnswer,
    switchTo,
    setIncomingCall: updateIncomingCall,
    setActiveCall: updateActiveCall,
  };
}

