import { useEffect, useState, useCallback, useRef } from 'react';
import { hangupCall } from '@/lib/services/hooks-api';
import { logger } from '@/lib/logger.client';

// Types - Device and Call instances are passed as parameters, not instantiated here
type Device = any;
type Call = any;

interface CallConnectParams {
  To: string;
  [key: string]: unknown;
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

interface UseCallHandlingReturn {
  activeCall: Call | null;
  incomingCall: Call | null;
  callState: string;
  makeCall: (params: CallConnectParams) => void;
  hangUp: () => Promise<void>;
  answer: () => void;
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
  const [incomingCall, setIncomingCallState] = useState<Call | null>(initialIncomingCall || null);
  const [callState, setCallState] = useState<string>('idle');
  const incomingCallRef = useRef<Call | null>(initialIncomingCall || null);
  const previousIncomingCallRef = useRef<Call | null>(initialIncomingCall || null);

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
    if (call.parameters.To.includes('client')) {
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
      console.error('Device is not ready');
      onError?.(new Error('Device is not ready'));
      return;
    }
    
    const connection = device.connect(params);
    connection.then((call: unknown) => {
      updateActiveCall(call);
      updateCallState('dialing');
    }).catch((err: unknown) => {
      console.error('Error making call:', err);
      onError?.(err instanceof Error ? err : new Error('Failed to make call'));
    });
  }, [device, updateActiveCall, updateCallState, onError]);

  // Hang up the active call
  const hangUp = useCallback(async () => {
    onDeviceBusyChange?.(false);
    
    if (!activeCall) {
      console.error('No active call to hang up');
      onError?.(new Error('No active call to hang up'));
      return;
    }

    try {
      await hangupCall({
        callSid: activeCall.parameters.CallSid,
        workspaceId,
      });

      onStatusChange?.('Registered');
      activeCall.disconnect();
      device?.disconnectAll();
      updateActiveCall(null);
      updateCallState('completed');
    } catch (err) {
      console.error('Error hanging up call:', err);
      if (err instanceof Error && err.message === 'Call is not in-progress. Cannot redirect.') {
        logger.debug('Call was already disconnected');
        onStatusChange?.('Registered');
        updateActiveCall(null);
        updateCallState('completed');
      } else {
        onError?.(err instanceof Error ? err : new Error('Failed to hang up call'));
      }
    }
  }, [activeCall, device, workspaceId, updateActiveCall, updateCallState, onStatusChange, onError, onDeviceBusyChange]);

  // Answer an incoming call
  const answer = useCallback(() => {
    const currentIncomingCall = incomingCallRef.current;
    if (currentIncomingCall) {
      currentIncomingCall.accept();
      updateCallState('connected');
    } else {
      console.error('No incoming call to answer');
      onError?.(new Error('No incoming call to answer'));
    }
  }, [updateCallState, onError]);

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
      updateActiveCall(null);
      onStatusChange?.('Registered');
      updateCallState('completed');
      onDeviceBusyChange?.(false);
    };

    const handleError = (err: Error) => {
      onDeviceBusyChange?.(false);
      onError?.(err);
      onStatusChange?.('error');
      updateCallState('failed');
      console.error('Call error:', err);
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

  return {
    activeCall,
    incomingCall,
    callState,
    makeCall,
    hangUp,
    answer,
    setIncomingCall: updateIncomingCall,
    setActiveCall: updateActiveCall,
  };
}

