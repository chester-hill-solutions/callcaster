import { useState, useCallback, useRef, useEffect } from 'react';
import { useCallDuration } from './useCallDuration';
import { useTwilioConnection } from './useTwilioConnection';
import { useCallHandling } from './useCallHandling';

// Types
type Device = any;
type Call = any;

// Lazy load Twilio SDK only on client side
const getTwilioSDK = () => {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SDK = require('@twilio/voice-sdk');
  return { Device: SDK.Device, Call: SDK.Call };
};

interface CallConnectParams {
    To: string;
    [key: string]: unknown;
}

interface TwilioDeviceHook {
  device: Device | null;
  status: string;
  error: Error | null;
  activeCall: Call | null;
  incomingCall: Call | null;
  makeCall: (params: CallConnectParams) => void;
  hangUp: () => void;
  answer: () => void;
  callState: string;
  callDuration: number;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  deviceIsBusy: boolean;
}

/**
 * Main hook for managing Twilio device and call operations
 * 
 * This hook coordinates between useTwilioConnection (device management) and
 * useCallHandling (call operations) to provide a unified API for Twilio functionality.
 * 
 * @param token - Twilio access token
 * @param selectedDevice - Selected device identifier (currently unused but kept for API compatibility)
 * @param workspaceId - Workspace ID for call operations
 * @param send - Callback function for state machine actions (e.g., CONNECT)
 * @returns Complete Twilio device and call management interface
 * 
 * @example
 * ```tsx
 * const {
 *   device,
 *   status,
 *   activeCall,
 *   makeCall,
 *   hangUp,
 *   callState,
 *   callDuration,
 * } = useTwilioDevice(token, deviceId, workspaceId, send);
 * ```
 */
export function useTwilioDevice(
  token: string,
  selectedDevice: string,
  workspaceId: string,
  send: (action: { type: string }) => void
): TwilioDeviceHook {
  // Validate required parameters
  if (!token) {
    throw new Error('useTwilioDevice: token is required');
  }
  if (!workspaceId) {
    throw new Error('useTwilioDevice: workspaceId is required');
  }
  if (typeof send !== 'function') {
    throw new Error('useTwilioDevice: send callback must be a function');
  }

  const [deviceIsBusy, setIsBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [incomingCallFromConnection, setIncomingCallFromConnection] = useState<Call | null>(null);
  const deviceRef = useRef<Device | null>(null);

  // Use extracted connection hook
  const connection = useTwilioConnection({
    token,
    onIncomingCall: (call) => {
      setIncomingCallFromConnection(call);
    },
    onStatusChange: (newStatus) => {
      setStatus(newStatus);
    },
    onError: (err) => {
      setError(err);
    },
    onCallStateChange: () => {
      // Handled by call handling hook
    },
    onDeviceBusyChange: (isBusy) => {
      setIsBusy(isBusy);
    },
  });

  // Sync device ref with connection device
  useEffect(() => {
    deviceRef.current = connection.device;
  }, [connection.device]);

  // Use extracted call handling hook
  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    incomingCall: incomingCallFromConnection,
    onCallStateChange: () => {
      // Handled by call duration hook
    },
    onActiveCallChange: () => {
      // State managed by hook
    },
    onIncomingCallChange: (call) => {
      setIncomingCallFromConnection(call);
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
      // Send CONNECT action to state machine for client calls
      send({ type: "CONNECT" });
    },
  });

  // Use extracted call duration hook
  const { callDuration, setCallDuration } = useCallDuration(callHandling.callState);

  // Incoming call is already synced via prop to useCallHandling

  // Sync error state from connection
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
    makeCall: callHandling.makeCall,
    hangUp: callHandling.hangUp,
    answer: callHandling.answer,
    callState: callHandling.callState,
    callDuration,
    setCallDuration,
    setIsBusy,
    deviceIsBusy,
  };
}